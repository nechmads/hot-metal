import { describe, expect, it } from 'vitest'
import { writerFixture } from './writer-conversation-fixtures'
import {
  createWriterSession,
  sendWriterMessage,
  getWriterConversation,
  listWriterDrafts,
  authorizeWriterExecution,
  sendWriterMessageSync,
} from '../src/bl/writer-conversations'
import {
  getSession,
  getDraftVersion,
  publishDraft,
  updateDraft,
} from '../src/bl/generation'

describe('shared conversational writer business operations', () => {
  it.each([undefined, 'pub'])(
    'starts a session with optional publication %s and server-owned origin',
    async (publicationId) => {
      const f = writerFixture()
      const created = await createWriterSession(
        f.caller,
        { title: 'Article', publicationId },
        f.d,
      )
      expect(created.publicationId).toBe(publicationId ?? null)
      expect(created).not.toHaveProperty('mcpConnectionId')
      expect(created).not.toHaveProperty('userId')
      expect(f.sessions.get(created.sessionId)?.mcpConnectionId).toBe(
        'connection',
      )
      expect((await getSession(f.caller, created.sessionId, f.d)).id).toBe(
        created.sessionId,
      )
    },
  )
  it('allows private writing even when an all-publication grant has no publications yet', async () => {
    const f = writerFixture()
    f.connection.publicationMode = 'all'
    f.connection.publicationIds = []
    await expect(createWriterSession(f.caller, {}, f.d)).resolves.toMatchObject(
      { publicationId: null },
    )
    expect(f.d.publications.getById).not.toHaveBeenCalled()
  })
  it.each(['ui-private', 'other-private'])(
    'hides unrelated unassigned session %s across all operations',
    async (id) => {
      const f = writerFixture()
      f.sessions.set('other-private', {
        ...f.sessions.get('private')!,
        id: 'other-private',
        mcpConnectionId: 'other-connection',
      })
      for (const action of [
        () => getSession(f.caller, id, f.d),
        () => listWriterDrafts(f.caller, id, f.d),
        () => getDraftVersion(f.caller, id, 1, f.d),
        () => updateDraft(f.caller, id, { content: 'Do not change' }, f.d),
        () => getWriterConversation(f.caller, { sessionId: id }, f.d),
        () =>
          sendWriterMessage(
            f.caller,
            { sessionId: id, message: 'Draft it', idempotencyKey: 'key' },
            f.d,
          ),
        () =>
          publishDraft(
            f.caller,
            { sessionId: id, publicationId: 'pub', slug: 'article' },
            f.d,
          ),
      ])
        await expect(action()).rejects.toMatchObject({ code: 'NOT_FOUND' })
      expect(f.d.conversations.enqueue).not.toHaveBeenCalled()
      expect(f.d.writer.publish).not.toHaveBeenCalled()
    },
  )
  it('rechecks actual publication after a private session becomes assigned', async () => {
    const f = writerFixture()
    f.sessions.get('private')!.publicationId = 'outside'
    await expect(
      getWriterConversation(f.caller, { sessionId: 'private' }, f.d),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  it('enqueues the writer with trusted origin and reads the conversation and saved drafts', async () => {
    const f = writerFixture()
    await expect(
      sendWriterMessage(
        f.caller,
        {
          sessionId: 'private',
          message: ' Write an article ',
          idempotencyKey: 'key',
        },
        f.d,
      ),
    ).resolves.toMatchObject({ turnId: 'turn', status: 'queued' })
    expect(f.d.conversations.enqueue).toHaveBeenCalledWith('private', {
      caller: f.caller,
      message: 'Write an article',
      idempotencyKey: 'key',
    })
    const history = await getWriterConversation(
      f.caller,
      { sessionId: 'private', turnId: 'turn', cursor: '0', limit: 10 },
      f.d,
    )
    expect(history.messages[0].text).toContain('intended reader')
    expect(f.d.conversations.read).toHaveBeenCalledWith('private', {
      caller: f.caller,
      turnId: 'turn',
      cursor: '0',
      limit: 10,
    })
    expect(await listWriterDrafts(f.caller, 'private', f.d)).toEqual([
      {
        version: 1,
        title: 'Draft',
        wordCount: 4,
        isFinal: false,
        createdAt: 1,
      },
    ])
    expect((await getDraftVersion(f.caller, 'private', 1, f.d)).content).toBe(
      'Written by Hot Metal',
    )
    expect(
      (await getSession(f.caller, 'private', f.d)).currentDraftVersion,
    ).toBe(1)
  })
  it('revocation blocks queued submission and conversation reads', async () => {
    const f = writerFixture()
    f.connection.state = 'revoked'
    await expect(
      sendWriterMessage(
        f.caller,
        { sessionId: 'private', message: 'Write', idempotencyKey: 'key' },
        f.d,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      getWriterConversation(f.caller, { sessionId: 'private' }, f.d),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(f.d.conversations.enqueue).not.toHaveBeenCalled()
  })
  it.each([
    { message: '', idempotencyKey: 'key' },
    { message: 'Write', idempotencyKey: '' },
  ])('rejects invalid message commands %j', async (input) => {
    const f = writerFixture()
    await expect(
      sendWriterMessage(f.caller, { sessionId: 'private', ...input }, f.d),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })
  it.each([{ cursor: 'NaN' }, { cursor: '-1' }, { limit: 0 }, { limit: 101 }])(
    'bounds conversation pagination %j',
    async (input) => {
      const f = writerFixture()
      await expect(
        getWriterConversation(
          f.caller,
          { sessionId: 'private', ...input },
          f.d,
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    },
  )
  it('validates effective writing style before model execution', async () => {
    const f = writerFixture()
    f.sessions.get('private')!.styleId = 'prebuilt'
    expect(
      (await authorizeWriterExecution(f.caller, 'private', f.d)).stylePrompt,
    ).toBe('Validated writing voice')
    f.sessions.get('private')!.styleId = 'custom'
    await expect(
      authorizeWriterExecution(f.caller, 'private', f.d),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      createWriterSession(f.caller, { styleId: 'custom' }, f.d),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      createWriterSession(
        f.caller,
        { publicationId: 'pub', styleId: 'pub-style' },
        f.d,
      ),
    ).resolves.toMatchObject({ publicationId: 'pub' })
  })
  it('can publish its private draft to an explicitly selected allowed publication', async () => {
    const f = writerFixture()
    await expect(
      publishDraft(
        f.caller,
        { sessionId: 'private', publicationId: 'pub', slug: 'article' },
        f.d,
      ),
    ).resolves.toMatchObject({ results: [{ publicationId: 'pub' }] })
    expect(f.sessions.get('private')).toMatchObject({
      publicationId: 'pub',
      mcpConnectionId: 'connection',
      status: 'completed',
    })
  })
  it('cannot rehome an assigned session or publish to a publication outside the grant', async () => {
    const f = writerFixture()
    await expect(
      publishDraft(
        f.caller,
        { sessionId: 'private', publicationId: 'outside', slug: 'article' },
        f.d,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    f.connection.publicationIds.push('outside')
    await expect(
      publishDraft(
        f.caller,
        { sessionId: 'assigned', publicationId: 'outside', slug: 'article' },
        f.d,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
  it('preserves the dashboard synchronous chat envelope and owner access to private sessions', async () => {
    const f = writerFixture()
    const clerk = { userId: 'user', credentialKind: 'clerk' as const }
    expect(
      await sendWriterMessageSync(
        clerk,
        { sessionId: 'ui-private', message: 'Continue writing' },
        f.d,
      ),
    ).toEqual({ text: 'A writer reply', finishReason: 'stop', usage: {} })
    expect((await getSession(clerk, 'private', f.d)).id).toBe('private')
  })
})
