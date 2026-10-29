// Test-only entrypoint. Production never imports this controlled model or identity hook.
import { createMcpHandler } from 'agents/mcp/server'
import { getAgentByName } from 'agents'
import type {
  LanguageModelV4,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider'
import { WriterAgent } from '../../src/agent/writer-agent'
import { createMcpServer } from '../../src/mcp/server'
import type { AuthenticatedCaller } from '../../src/bl/caller'

const question = 'Who is the intended reader?'
const firstDraft = 'An original article for curious readers.'
const revisedDraft =
  'A revised article with a practical example for curious readers.'
const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
}

export class ControlledWriterAgent extends WriterAgent {
  private releaseQueuedTurn?: () => void
  private releaseModel?: () => void
  private readonly fixtureInstanceId = crypto.randomUUID()

  override async runMcpWriterTurn(payload: unknown): Promise<void> {
    if (this.name.startsWith('queued-revocation-')) {
      // The real SDK alarm still invokes this queue callback. Hold only its start
      // so the test can revoke policy deterministically before real execution.
      await new Promise<void>((resolve) => {
        this.releaseQueuedTurn = resolve
      })
    }
    return super.runMcpWriterTurn(payload)
  }

  override async onRequest(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === '/__fixture/release') {
      this.releaseQueuedTurn?.()
      this.releaseModel?.()
      return Response.json({
        released: !!this.releaseQueuedTurn || !!this.releaseModel,
      })
    }
    if (new URL(request.url).pathname === '/__fixture/inspect') {
      this
        .sql`CREATE TABLE IF NOT EXISTS fixture_model_calls (id INTEGER PRIMARY KEY)`
      return Response.json({
        instanceId: this.fixtureInstanceId,
        modelHeld: !!this.releaseModel,
        modelCalls: this.sql<{
          count: number
        }>`SELECT COUNT(*) AS count FROM fixture_model_calls`[0].count,
        isGenerating: this.state.isGenerating,
        turns: this.sql`SELECT turn_id, status FROM mcp_writer_turns`,
        drafts: this.listDrafts(),
        queueHeld: !!this.releaseQueuedTurn,
        messageCount: this.messages.length,
      })
    }
    return super.onRequest(request)
  }

  override async trackedModel(): Promise<LanguageModelV4> {
    return {
      specificationVersion: 'v4',
      provider: 'local-controlled-fixture',
      modelId: 'writer-conversation-v4',
      supportedUrls: {},
      doGenerate: async () => {
        throw new Error('Expected the real streaming writer path')
      },
      doStream: async (options) => {
        const users = options.prompt.filter(
          (message) => message.role === 'user',
        )
        const prompt = JSON.stringify(options.prompt)
        this
          .sql`CREATE TABLE IF NOT EXISTS fixture_model_calls (id INTEGER PRIMARY KEY)`
        this.sql`INSERT INTO fixture_model_calls DEFAULT VALUES`
        const ownerTurn = prompt.includes(
          'Owner UI draft; pause before model output.',
        )
        const hasPublishTool = options.tools?.some(
          (tool) => tool.type === 'function' && tool.name === 'publish_to_cms',
        )
        if (ownerTurn && !hasPublishTool)
          throw new Error('Owner UI turn lost its ordinary publish tool')
        if (
          !ownerTurn &&
          options.tools?.some(
            (tool) =>
              tool.type === 'function' && tool.name === 'publish_to_cms',
          )
        ) {
          throw new Error('Delegated writer must not expose publishing')
        }
        if (users.length > 1 && !prompt.includes(question)) {
          throw new Error(
            'Prior assistant reply did not reach the next model turn',
          )
        }
        if (users.length > 2 && !prompt.includes('Version one is saved.')) {
          throw new Error('Prior draft reply did not reach the revision turn')
        }
        const revokeDuringTurn = prompt.includes(
          'Revoke before saving this draft.',
        )
        if (revokeDuringTurn) {
          await this.env.DAL.revokeMcpConnection('connection-c', 'owner')
        }
        const afterTool =
          options.prompt[options.prompt.length - 1]?.role === 'tool'
        const pauseForEviction =
          prompt.includes('Pause this MCP stream for eviction.') ||
          prompt.includes('Pause delegated stream for websocket overlap.')
        if (!afterTool && (ownerTurn || pauseForEviction)) {
          await new Promise<void>((resolve) => {
            this.releaseModel = resolve
          })
        }
        const save =
          (users.length > 1 || revokeDuringTurn || ownerTurn) && !afterTool
        const version = Math.max(1, users.length - 1)
        const text = ownerTurn
          ? 'Owner draft is saved.'
          : users.length === 1
            ? question
            : version === 1
              ? 'Version one is saved.'
              : 'Version two is saved.'
        const parts: LanguageModelV4StreamPart[] = [
          { type: 'stream-start', warnings: [] },
          ...(save
            ? [
                {
                  type: 'tool-call' as const,
                  toolCallId: `save-v${version}`,
                  toolName: 'save_draft',
                  input: JSON.stringify({
                    title:
                      version === 1 ? 'Original article' : 'Revised article',
                    content: ownerTurn
                      ? 'Owner retains unrestricted writer tools.'
                      : version === 1
                        ? firstDraft
                        : revisedDraft,
                    feedback:
                      version > 1 ? 'Add a practical example.' : undefined,
                  }),
                },
              ]
            : [
                { type: 'text-start' as const, id: 'reply' },
                { type: 'text-delta' as const, id: 'reply', delta: text },
                { type: 'text-end' as const, id: 'reply' },
              ]),
          {
            type: 'finish',
            usage,
            finishReason: {
              unified: save ? 'tool-calls' : 'stop',
              raw: save ? 'tool_use' : 'stop',
            },
          },
        ]
        return {
          stream: new ReadableStream({
            start(controller) {
              for (const part of parts) controller.enqueue(part)
              controller.close()
            },
          }),
        }
      },
    }
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)
    // This header exists only in this isolated fixture. Real OAuth is exercised by
    // mcp-oauth-integration.spec.ts; all actual BL and actor authorization stays live.
    const identity = request.headers.get('X-Fixture-Connection') ?? 'a'
    const caller: AuthenticatedCaller = {
      userId: 'owner',
      credentialKind: 'mcp',
      connectionId: `connection-${identity}`,
      clientId: `client-${identity}`,
      grantId: `grant-${identity}`,
      policyVersion: 1,
      scopes: ['hotmetal:read', 'hotmetal:write'],
    }
    if (url.pathname.startsWith('/__fixture/ws/')) {
      const id = url.pathname.slice('/__fixture/ws/'.length)
      const actor = await getAgentByName(env.WRITER_AGENT, id)
      return actor.fetch(new Request('https://writer/', request))
    }
    if (url.pathname.startsWith('/__fixture/chat/')) {
      const id = url.pathname.slice('/__fixture/chat/'.length)
      const session = await env.DAL.getSessionById(id)
      if (!session || session.userId !== 'owner')
        return new Response('Not found', { status: 404 })
      const actor = await getAgentByName(env.WRITER_AGENT, id)
      return actor.fetch(new Request('https://writer/chat', request))
    }
    if (url.pathname.startsWith('/__fixture/release/')) {
      const id = url.pathname.slice('/__fixture/release/'.length)
      const actor = await getAgentByName(env.WRITER_AGENT, id)
      return actor.fetch(new Request('https://writer/__fixture/release'))
    }
    if (url.pathname.startsWith('/__fixture/inspect/')) {
      const id = url.pathname.slice('/__fixture/inspect/'.length)
      const actor = await getAgentByName(env.WRITER_AGENT, id)
      return actor.fetch(new Request('https://writer/__fixture/inspect'))
    }
    if (url.pathname.startsWith('/__fixture/actor/')) {
      const id = url.pathname.slice('/__fixture/actor/'.length)
      const actor = await getAgentByName(env.WRITER_AGENT, id)
      return actor.fetch(
        new Request('https://writer/internal/writer/conversation', {
          method: 'POST',
          body: JSON.stringify({ caller }),
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    const canonical = new Request(
      `https://hotmetalapp.com${url.pathname}${url.search}`,
      request,
    )
    canonical.headers.set('Host', 'hotmetalapp.com')
    const handler = createMcpHandler(() => createMcpServer(caller, env, ctx), {
      route: '/mcp',
      allowedHostnames: ['hotmetalapp.com'],
      allowedOriginHostnames: ['hotmetalapp.com'],
    })
    return handler(canonical, env, ctx)
  },
}
