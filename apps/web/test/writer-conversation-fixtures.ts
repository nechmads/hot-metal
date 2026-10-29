import { vi } from 'vitest'
import type { McpConnection } from '@hotmetal/content-core'
import type { AuthenticatedCaller } from '../src/bl/caller'
import type { GenerationSession } from '../src/bl/generation'
import type {
  WriterConversationDependencies,
  WriterTurn,
} from '../src/bl/writer-conversations'

export function writerFixture() {
  const connection: McpConnection = {
    id: 'connection',
    userId: 'user',
    clientId: 'client',
    grantId: 'grant',
    label: 'Claude',
    actions: ['read', 'write', 'publish'],
    publicationMode: 'selected',
    publicationIds: ['pub'],
    outlets: [],
    policyVersion: 1,
    state: 'active',
    createdAt: 1,
    updatedAt: 1,
    revokedAt: null,
    lastUsedAt: null,
  }
  const caller: AuthenticatedCaller = {
    userId: 'user',
    credentialKind: 'mcp',
    connectionId: connection.id,
    clientId: connection.clientId,
    grantId: connection.grantId!,
    policyVersion: 1,
    scopes: ['hotmetal:read', 'hotmetal:write', 'hotmetal:publish'],
  }
  const sessions = new Map<string, GenerationSession>([
    [
      'assigned',
      {
        id: 'assigned',
        userId: 'user',
        publicationId: 'pub',
        mcpConnectionId: null,
        title: 'Article',
        status: 'active',
        cmsPostId: null,
        currentDraftVersion: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    [
      'private',
      {
        id: 'private',
        userId: 'user',
        publicationId: null,
        mcpConnectionId: 'connection',
        title: 'Private article',
        status: 'active',
        cmsPostId: null,
        currentDraftVersion: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    [
      'ui-private',
      {
        id: 'ui-private',
        userId: 'user',
        publicationId: null,
        mcpConnectionId: null,
        title: 'Personal notes',
        status: 'active',
        cmsPostId: null,
        currentDraftVersion: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  ])
  const drafts = [
    {
      id: 'draft-1',
      version: 1,
      title: 'Draft',
      content: 'Written by Hot Metal',
      word_count: 4,
      is_final: 0,
      created_at: 1,
    },
  ]
  const turn: WriterTurn = {
    turnId: 'turn',
    sessionId: 'private',
    status: 'queued',
    error: null,
    createdAt: 1,
    updatedAt: 1,
  }
  let count = 0
  const d: WriterConversationDependencies = {
    mcpEnabled: true,
    users: { getById: vi.fn(async () => ({ id: 'user', tier: 'creator' })) },
    connections: {
      getById: vi.fn(async (id) => (id === connection.id ? connection : null)),
    },
    publications: {
      getById: vi.fn(async (id) => ({
        id,
        userId: 'user',
        defaultAuthor: 'Author',
        slug: id,
        autoPublishMode: 'draft',
        styleId: 'pub-style',
        cmsProvider: 'emdash',
        cmsProvisioningStatus: 'ready',
      })),
    },
    styles: {
      getById: vi.fn(async (id) => ({
        id,
        userId: id === 'foreign' ? 'other' : 'user',
        isPrebuilt: id === 'prebuilt',
        systemPrompt: 'Validated writing voice',
      })),
    },
    sessions: {
      getById: vi.fn(async (id) => sessions.get(id) ?? null),
      create: vi.fn(async (input) => {
        const value: GenerationSession = {
          ...input,
          publicationId: input.publicationId ?? null,
          mcpConnectionId: input.mcpConnectionId ?? null,
          title: input.title ?? null,
          styleId: input.styleId ?? null,
          status: 'active',
          cmsPostId: null,
          currentDraftVersion: 0,
          createdAt: 1,
          updatedAt: 1,
        }
        sessions.set(value.id, value)
        return value
      }),
      update: vi.fn(async (id, input) => {
        const value = sessions.get(id)!
        Object.assign(value, input)
        return value
      }),
      countCompletedForWeek: vi.fn(async () => 0),
    },
    writer: {
      autoWrite: vi.fn(async () => ({ success: true })),
      listDrafts: vi.fn(async () => drafts),
      getDraft: vi.fn(
        async (_id, version) =>
          drafts.find((draft) => draft.version === version) ?? null,
      ),
      updateDraft: vi.fn(async () => ({ success: true })),
      publish: vi.fn(async (_id, input) => ({
        success: true,
        results: [
          {
            postId: 'post',
            publicationId: input.publicationId!,
            slug: input.slug,
            url: 'https://pub.example/article',
          },
        ],
      })),
      auxiliary: vi.fn(async () => ({
        text: 'A writer reply',
        finishReason: 'stop',
        usage: {},
      })),
    },
    conversations: {
      enqueue: vi.fn(async (sessionId) => ({ ...turn, sessionId })),
      read: vi.fn(async (sessionId) => ({
        sessionId,
        messages: [
          {
            id: 'answer',
            role: 'assistant' as const,
            text: 'Who is the intended reader?',
          },
        ],
        turns: [{ ...turn, sessionId }],
        nextCursor: null,
      })),
    },
    social: { share: vi.fn(async () => ({ success: true })) },
    feeds: { regenerate: vi.fn(async () => {}) },
    scout: { start: vi.fn(async () => {}) },
    newId: () => `created-${++count}`,
    now: () => 1,
    hash: async (value) => value,
    log: vi.fn(),
  }
  return { caller, connection, sessions, drafts, d }
}
