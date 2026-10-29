import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { build } from 'esbuild'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

let runtime: Miniflare
let directory: string
let restartRuntime: () => Promise<void>
async function request(path: string, init: RequestInit = {}) {
  return runtime.dispatchFetch('https://hotmetalapp.com' + path, {
    ...init,
    headers: {
      Host: 'hotmetalapp.com',
      ...Object.fromEntries(new Headers(init.headers)),
    },
  } as Parameters<Miniflare['dispatchFetch']>[1])
}
async function call(
  name: string,
  args: Record<string, unknown>,
  connection = 'a',
) {
  const response = await request('/mcp', {
    method: 'POST',
    headers: {
      'X-Fixture-Connection': connection,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  })
  const text = await response.text()
  expect(response.status, text).toBe(200)
  const events = text.split('\n').filter((line) => line.startsWith('data: '))
  const message = JSON.parse(
    text.trim().startsWith('{') ? text : events[events.length - 1]!.slice(6),
  )
  expect(message.error, text).toBeUndefined()
  return message.result
}
async function successful(
  name: string,
  args: Record<string, unknown>,
  connection = 'a',
) {
  const result = await call(name, args, connection)
  expect(result.isError, JSON.stringify(result)).not.toBe(true)
  return result.structuredContent
}
async function finishTurn(sessionId: string, message: string, key: string) {
  const receipt = await successful('sendWriterMessage', {
    sessionId,
    message,
    idempotencyKey: key,
  })
  expect(['queued', 'running', 'completed']).toContain(receipt.status)
  let conversation: any
  await expect
    .poll(
      async () => {
        conversation = await successful('getWriterConversation', {
          sessionId,
          turnId: receipt.turnId,
        })
        const status = conversation.turns.find(
          (turn: any) => turn.turnId === receipt.turnId,
        )?.status
        return ['completed', 'failed', 'cancelled', 'interrupted'].includes(
          status,
        )
      },
      { timeout: 20_000, interval: 25 },
    )
    .toBe(true)
  expect(
    conversation.turns.find((turn: any) => turn.turnId === receipt.turnId)
      ?.status,
    JSON.stringify(conversation),
  ).toBe('completed')
  return { receipt, conversation }
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hotmetal-writer-conversation-'))
  const root = resolve(import.meta.dirname, '../../..')
  const common = {
    bundle: true,
    format: 'esm' as const,
    platform: 'node' as const,
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire('/fixture.mjs');",
    },
    conditions: ['workerd'],
    external: ['cloudflare:workers', 'cloudflare:email', 'node:*'],
    logLevel: 'silent' as const,
  }
  await build({
    ...common,
    entryPoints: [
      resolve(import.meta.dirname, 'fixtures/writer-conversation-worker.ts'),
    ],
    outfile: join(directory, 'web.mjs'),
  })
  await build({
    ...common,
    entryPoints: [resolve(root, 'services/data-layer/src/index.ts')],
    outfile: join(directory, 'dal.mjs'),
  })
  const webSource = await readFile(join(directory, 'web.mjs'), 'utf8')
  const dalSource = await readFile(join(directory, 'dal.mjs'), 'utf8')
  const options = (revision = '') =>
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'web',
          script: webSource + revision,
          modules: true,
          compatibilityDate: '2026-10-29',
          compatibilityFlags: ['nodejs_compat'],
          bindings: {
            MCP_ENABLED: 'true',
            INTERNAL_API_KEY: 'local-only-writer-fixture-key',
          },
          serviceBindings: { DAL: { name: 'dal', entrypoint: 'DataLayer' } },
          durableObjects: {
            WRITER_AGENT: {
              className: 'ControlledWriterAgent',
              useSQLite: true,
            },
          },
        },
        {
          name: 'dal',
          script: dalSource,
          modules: true,
          compatibilityDate: '2026-10-29',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: ['DB'],
          bindings: { TOKEN_ENCRYPTION_KEY: '01'.repeat(32) },
        },
      ],
    })
  runtime = new Miniflare(options())
  restartRuntime = () =>
    runtime.setOptions(options('\n// forced fixture cold restart'))
  const db = await runtime.getD1Database('DB', 'dal')
  for (const file of (
    await readdir(resolve(root, 'services/data-layer/migrations'))
  )
    .filter((file) => file.endsWith('.sql'))
    .sort()) {
    const sql = (
      await readFile(
        resolve(root, 'services/data-layer/migrations', file),
        'utf8',
      )
    ).replace(/--[^\n]*/g, '')
    for (const statement of sql
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean))
      await db.prepare(statement).run()
  }
  await db
    .prepare(
      "INSERT INTO users (id,email,name,tier) VALUES ('owner','owner@example.test','Owner','creator'),('foreign','foreign@example.test','Foreign','creator')",
    )
    .run()
  await db
    .prepare(
      "INSERT INTO publications (id,user_id,name,slug) VALUES ('pub-good','owner','Good','good'),('pub-other','owner','Other','other'),('pub-foreign','foreign','Foreign','foreign')",
    )
    .run()
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f'])
    await db
      .prepare(
        `INSERT INTO mcp_connections (id,user_id,client_id,grant_id,label,actions,publication_mode,publication_ids,outlets,state,created_at,updated_at) VALUES (?,'owner',?,?,?,'["read","write"]','selected','["pub-good"]','[]','active',1,1)`,
      )
      .bind(`connection-${id}`, `client-${id}`, `grant-${id}`, `Fixture ${id}`)
      .run()
  await db
    .prepare(
      "INSERT INTO sessions (id,user_id,title) VALUES ('private-ui','owner','Private dashboard conversation'),('foreign-session','foreign','Someone else')",
    )
    .run()
}, 60_000)
afterAll(async () => {
  if (runtime) await runtime.dispose()
  if (directory) await rm(directory, { recursive: true, force: true })
})

describe('real MCP to WriterAgent conversation and draft storage', () => {
  it.each([undefined, 'pub-good'])(
    'interviews, saves, revises and retrieves drafts with publication %s',
    async (publicationId) => {
      const session = await successful('createWritingSession', {
        title: 'MCP writer integration',
        publicationId,
      })
      expect(session.publicationId).toBe(publicationId ?? null)
      const { conversation, receipt } = await finishTurn(
        session.sessionId,
        'Help me write an article.',
        'interview',
      )
      expect(
        conversation.messages.map((message: any) => [
          message.role,
          message.text,
        ]),
      ).toEqual([
        ['user', 'Help me write an article.'],
        ['assistant', 'Who is the intended reader?'],
      ])
      const replay = await successful('sendWriterMessage', {
        sessionId: session.sessionId,
        message: 'Help me write an article.',
        idempotencyKey: 'interview',
      })
      expect(replay.turnId).toBe(receipt.turnId)
      const repeated = await successful('getWriterConversation', {
        sessionId: session.sessionId,
      })
      expect(repeated.messages).toHaveLength(2)
      const conflict = await call('sendWriterMessage', {
        sessionId: session.sessionId,
        message: 'Changed retry message',
        idempotencyKey: 'interview',
      })
      expect(conflict.isError).toBe(true)
      expect(JSON.parse(conflict.content[0].text).code).toBe('CONFLICT')
      await finishTurn(
        session.sessionId,
        'Curious readers. Please draft it.',
        'draft',
      )
      const revised = await finishTurn(
        session.sessionId,
        'Add a practical example.',
        'revision',
      )
      expect(
        revised.conversation.messages.map((message: any) => message.role),
      ).toEqual(['user', 'assistant', 'user', 'assistant', 'user', 'assistant'])
      expect(revised.conversation.messages.at(-1).text).toBe(
        'Version two is saved.',
      )
      expect(JSON.stringify(revised.conversation)).not.toMatch(
        /tool-call|save_draft|providerMetadata|inputTokens/,
      )
      const drafts = await successful('listDrafts', {
        sessionId: session.sessionId,
      })
      expect(drafts.data.map((draft: any) => draft.version).sort()).toEqual([
        1, 2,
      ])
      const first = await successful('getDraftVersion', {
        sessionId: session.sessionId,
        version: 1,
      })
      const second = await successful('getDraftVersion', {
        sessionId: session.sessionId,
        version: 2,
      })
      expect(first.content).toBe('An original article for curious readers.')
      expect(second.content).toBe(
        'A revised article with a practical example for curious readers.',
      )
      const page = await successful('getWriterConversation', {
        sessionId: session.sessionId,
        limit: 2,
      })
      expect(page.messages).toHaveLength(2)
      expect(page.nextCursor).toBeTypeOf('string')
      const next = await successful('getWriterConversation', {
        sessionId: session.sessionId,
        limit: 2,
        cursor: page.nextCursor,
      })
      expect(next.messages[0].id).not.toBe(page.messages[0].id)
    },
    60_000,
  )

  it('denies other connections, private UI sessions and inaccessible publications', async () => {
    const session = await successful('createWritingSession', {})
    for (const sessionId of [
      session.sessionId,
      'private-ui',
      'foreign-session',
    ]) {
      for (const name of [
        'getWriterConversation',
        'listDrafts',
        'getDraftVersion',
        'sendWriterMessage',
      ]) {
        const result = await call(
          name,
          {
            sessionId,
            version: 1,
            message: 'Read this',
            idempotencyKey: 'denied',
          },
          'b',
        )
        expect(result.isError, name + ' ' + sessionId).toBe(true)
        expect(JSON.parse(result.content[0].text).code).toBe('NOT_FOUND')
      }
    }
    for (const publicationId of ['pub-other', 'pub-foreign']) {
      const denied = await call('createWritingSession', { publicationId })
      expect(denied.isError).toBe(true)
      expect(JSON.parse(denied.content[0].text).code).toBe('NOT_FOUND')
    }
    const actorResponse = await request('/__fixture/actor/' + session.sessionId)
    expect(actorResponse.status).toBe(401)
  })

  it('cancels a durably queued turn when its connection is revoked before execution', async () => {
    const sessionId = 'queued-revocation-fixture'
    const db = await runtime.getD1Database('DB', 'dal')
    await db
      .prepare(
        "INSERT INTO sessions (id,user_id,title,mcp_connection_id) VALUES (?,'owner','Queued revocation','connection-d')",
      )
      .bind(sessionId)
      .run()
    const receipt = await successful(
      'sendWriterMessage',
      {
        sessionId,
        message: 'Please interview me.',
        idempotencyKey: 'queued-revoke',
      },
      'd',
    )
    await expect
      .poll(
        async () => {
          const inspection: any = await (
            await request('/__fixture/inspect/' + sessionId)
          ).json()
          return inspection.queueHeld
        },
        { timeout: 20_000, interval: 25 },
      )
      .toBe(true)
    await db
      .prepare(
        "UPDATE mcp_connections SET state = 'revoked', revoked_at = 2 WHERE id = 'connection-d'",
      )
      .run()
    expect((await request('/__fixture/release/' + sessionId)).status).toBe(200)
    let inspection: any
    await expect
      .poll(
        async () => {
          inspection = await (
            await request('/__fixture/inspect/' + sessionId)
          ).json()
          return inspection.turns.find(
            (turn: any) => turn.turn_id === receipt.turnId,
          )?.status
        },
        { timeout: 20_000, interval: 25 },
      )
      .toBe('cancelled')
    expect(inspection.drafts).toEqual([])
    expect(inspection.messageCount).toBe(0)
  })

  it('blocks a real tool side effect when policy is revoked during model generation', async () => {
    const session = await successful('createWritingSession', {}, 'c')
    const receipt = await successful(
      'sendWriterMessage',
      {
        sessionId: session.sessionId,
        message: 'Revoke before saving this draft.',
        idempotencyKey: 'midturn-revoke',
      },
      'c',
    )
    let inspection: any
    await expect
      .poll(
        async () => {
          inspection = await (
            await request('/__fixture/inspect/' + session.sessionId)
          ).json()
          return inspection.turns.find(
            (turn: any) => turn.turn_id === receipt.turnId,
          )?.status
        },
        { timeout: 20_000, interval: 25 },
      )
      .toBe('cancelled')
    expect(inspection.drafts).toEqual([])
  })

  it('keeps an owner UI turn independent of a revoked MCP turn queued behind it', async () => {
    const session = await successful('createWritingSession', {}, 'e')
    const ownerResponse = request('/__fixture/chat/' + session.sessionId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Owner UI draft; pause before model output.',
      }),
    })
    await expect
      .poll(
        async () => {
          const inspection: any = await (
            await request('/__fixture/inspect/' + session.sessionId)
          ).json()
          return inspection.modelHeld
        },
        { timeout: 20_000, interval: 25 },
      )
      .toBe(true)
    const receipt = await successful(
      'sendWriterMessage',
      {
        sessionId: session.sessionId,
        message: 'MCP queued behind owner.',
        idempotencyKey: 'after-owner',
      },
      'e',
    )
    const db = await runtime.getD1Database('DB', 'dal')
    await db
      .prepare(
        "UPDATE mcp_connections SET state = 'revoked', revoked_at = 2 WHERE id = 'connection-e'",
      )
      .run()
    await request('/__fixture/release/' + session.sessionId)
    const response = await ownerResponse
    expect(response.status, await response.clone().text()).toBe(200)
    expect(await response.json()).toMatchObject({
      text: 'Owner draft is saved.',
    })
    let inspection: any
    await expect
      .poll(
        async () => {
          inspection = await (
            await request('/__fixture/inspect/' + session.sessionId)
          ).json()
          return inspection.turns.find(
            (turn: any) => turn.turn_id === receipt.turnId,
          )?.status
        },
        { timeout: 20_000, interval: 25 },
      )
      .toBe('cancelled')
    expect(inspection.drafts).toHaveLength(1)
    expect(inspection.modelCalls).toBe(2)
    expect(inspection.messageCount).toBe(2)
    expect(inspection.isGenerating).toBe(false)
  }, 60_000)

  it('rejects an overlapping real UI WebSocket submit before it can replace MCP history', async () => {
    const session = await successful('createWritingSession', {})
    const upgraded = await request('/__fixture/ws/' + session.sessionId, {
      headers: { Upgrade: 'websocket' },
    })
    expect(upgraded.status).toBe(101)
    const socket = upgraded.webSocket!
    socket.accept()
    const frames: any[] = []
    socket.addEventListener('message', (event) => {
      frames.push(JSON.parse(String(event.data)))
    })
    try {
      const receipt = await successful('sendWriterMessage', {
        sessionId: session.sessionId,
        message: 'Pause delegated stream for websocket overlap.',
        idempotencyKey: 'websocket-overlap',
      })
      await expect
        .poll(
          async () => {
            const inspection: any = await (
              await request('/__fixture/inspect/' + session.sessionId)
            ).json()
            return inspection.modelHeld
          },
          { timeout: 20_000, interval: 25 },
        )
        .toBe(true)
      socket.send(
        JSON.stringify({
          type: 'cf_agent_use_chat_request',
          id: 'overlapping-ui-submit',
          init: {
            method: 'POST',
            body: JSON.stringify({
              messages: [
                {
                  id: 'overlapping-ui-message',
                  role: 'user',
                  parts: [
                    {
                      type: 'text',
                      text: 'Stale UI request must not erase the delegated user message.',
                    },
                  ],
                },
              ],
            }),
          },
        }),
      )
      await expect
        .poll(
          () =>
            frames.find(
              (frame) =>
                frame.type === 'cf_agent_use_chat_response' &&
                frame.id === 'overlapping-ui-submit' &&
                frame.error,
            ),
          { timeout: 20_000, interval: 25 },
        )
        .toBeTruthy()
      const held = await successful('getWriterConversation', {
        sessionId: session.sessionId,
      })
      expect(held.messages.map((message: any) => message.text)).toEqual([
        'Pause delegated stream for websocket overlap.',
      ])
      await request('/__fixture/release/' + session.sessionId)
      await expect
        .poll(
          async () => {
            const conversation = await successful('getWriterConversation', {
              sessionId: session.sessionId,
              turnId: receipt.turnId,
            })
            return conversation.turns[0].status
          },
          { timeout: 20_000, interval: 25 },
        )
        .toBe('completed')
      const completed = await successful('getWriterConversation', {
        sessionId: session.sessionId,
      })
      expect(completed.messages.map((message: any) => message.text)).toEqual([
        'Pause delegated stream for websocket overlap.',
        'Who is the intended reader?',
      ])
    } finally {
      socket.close()
      await request('/__fixture/release/' + session.sessionId)
    }
  }, 60_000)

  it('marks a cold-restarted running MCP turn interrupted without replaying model or draft side effects', async () => {
    const session = await successful('createWritingSession', {}, 'f')
    const receipt = await successful(
      'sendWriterMessage',
      {
        sessionId: session.sessionId,
        message: 'Pause this MCP stream for eviction.',
        idempotencyKey: 'evict-running',
      },
      'f',
    )
    let before: any
    await expect
      .poll(
        async () => {
          before = await (
            await request('/__fixture/inspect/' + session.sessionId)
          ).json()
          return (
            before.modelHeld &&
            before.turns.find((turn: any) => turn.turn_id === receipt.turnId)
              ?.status
          )
        },
        { timeout: 20_000, interval: 25 },
      )
      .toBe('running')
    expect(before.modelCalls).toBe(1)
    await restartRuntime()
    let after: any
    await expect
      .poll(
        async () => {
          after = await (
            await request('/__fixture/inspect/' + session.sessionId)
          ).json()
          return after.turns.find(
            (turn: any) => turn.turn_id === receipt.turnId,
          )?.status
        },
        { timeout: 20_000, interval: 25 },
      )
      .toBe('interrupted')
    expect(after.instanceId).not.toBe(before.instanceId)
    expect(after.modelCalls).toBe(1)
    expect(after.drafts).toEqual([])
    expect(after.isGenerating).toBe(false)
    const conversation = await successful(
      'getWriterConversation',
      { sessionId: session.sessionId, turnId: receipt.turnId },
      'f',
    )
    expect(conversation.turns[0].status).toBe('interrupted')
    const replay = await successful(
      'sendWriterMessage',
      {
        sessionId: session.sessionId,
        message: 'Pause this MCP stream for eviction.',
        idempotencyKey: 'evict-running',
      },
      'f',
    )
    expect(replay.turnId).toBe(receipt.turnId)
    expect(replay.status).toBe('interrupted')
  }, 60_000)

  it('rechecks live revocation instead of trusting fixture identity or cached actor state', async () => {
    const session = await successful('createWritingSession', {}, 'b')
    const db = await runtime.getD1Database('DB', 'dal')
    await db
      .prepare(
        "UPDATE mcp_connections SET state = 'revoked', revoked_at = 2 WHERE id = 'connection-b'",
      )
      .run()
    for (const name of [
      'getWriterConversation',
      'sendWriterMessage',
      'listDrafts',
    ]) {
      const denied = await call(
        name,
        {
          sessionId: session.sessionId,
          message: 'Write',
          idempotencyKey: 'revoked',
        },
        'b',
      )
      expect(denied.isError).toBe(true)
      expect(JSON.parse(denied.content[0].text).code).toBe('FORBIDDEN')
    }
  })
})
