import { vi } from 'vitest'
import {
  DEFAULT_SCHEDULE,
  type McpConnection,
  type Post,
  type Idea,
} from '@hotmetal/content-core'
import type { CmsClient } from '@hotmetal/shared'
import type { AuthenticatedCaller } from '../src/bl/caller'
import type { ContentDependencies, ContentPublication } from '../src/bl/content'

export const owner: AuthenticatedCaller = {
  userId: 'owner',
  credentialKind: 'api-key',
}
export const mcp: AuthenticatedCaller = {
  ...owner,
  credentialKind: 'mcp',
  connectionId: 'connection',
  clientId: 'client',
  grantId: 'grant',
  policyVersion: 1,
  scopes: ['hotmetal:read', 'hotmetal:write', 'hotmetal:publish'],
}
export const publication: ContentPublication = {
  id: 'pub',
  userId: 'owner',
  name: 'Test',
  slug: 'test',
  description: null,
  writingTone: null,
  defaultAuthor: 'Ada',
  cmsPublicationId: 'cms-pub',
  cmsProvider: 'sonicjs',
  cmsProvisioningStatus: null,
  cmsInstanceMeta: 'private-instance',
  cmsBaseUrl: 'https://private.example',
  autoPublishMode: 'ideas-only',
  cadencePostsPerWeek: 1,
  scoutSchedule: DEFAULT_SCHEDULE,
  timezone: 'UTC',
  scoutEnabled: true,
  styleId: 'required-style',
}
export const currentPost: Post = {
  id: 'post',
  publicationId: 'cms-pub',
  title: 'Original',
  slug: 'original',
  content: '<p>Original</p>',
  markdown: 'Original',
  author: 'Ada',
  status: 'draft',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}
export function fixture() {
  const connection: McpConnection = {
    id: 'connection',
    userId: 'owner',
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
  const cms = {
    listPosts: vi.fn(async () => ({ data: [] as Post[] })),
    getPost: vi.fn(async () => ({ ...currentPost })),
    createPost: vi.fn(async (input: Partial<Post>) => ({
      ...currentPost,
      ...input,
    })),
    updatePost: vi.fn(async (_id: string, input: Partial<Post>) => ({
      ...currentPost,
      ...input,
    })),
    createPublication: vi.fn(async () => ({
      id: 'created-cms',
      title: 'Test',
      slug: 'test',
    })),
  }
  const deps = {
    mcpEnabled: true as boolean,
    users: {
      getById: vi.fn(async () => ({
        id: 'owner',
        tier: 'creator',
        name: 'Ada',
        email: 'private@example.com',
      })),
    },
    connections: { getById: vi.fn(async () => connection) },
    publications: {
      getById: vi.fn(async (id: string) =>
        id === 'pub'
          ? { ...publication }
          : id === 'other'
            ? { ...publication, id: 'other' }
            : null,
      ),
      listByUser: vi.fn(async () => [
        { ...publication },
        { ...publication, id: 'other' },
      ]),
      countByUser: vi.fn(async () => 1),
      create: vi.fn(async (input: Partial<ContentPublication>) => ({
        ...publication,
        ...input,
      })),
      update: vi.fn(
        async (_id: string, input: Partial<ContentPublication>) => ({
          ...publication,
          ...input,
        }),
      ),
      delete: vi.fn(async () => {}),
    },
    topics: { listByPublication: vi.fn(async () => []) },
    ideas: {
      getById: vi.fn(async (): Promise<Idea | null> => null),
      listByPublication: vi.fn(async () => []),
      countByPublication: vi.fn(async () => 0),
      recentByPublications: vi.fn(async () => []),
      updateStatus: vi.fn(async () => null),
      dismissByPublications: vi.fn(async (_ids: string[]) => 2),
      deleteByPublications: vi.fn(async (_ids: string[]) => 4),
      promote: vi.fn(async () => null),
    },
    styles: {
      listByUser: vi.fn(async () => [
        {
          id: 'prebuilt',
          userId: null,
          name: 'Prebuilt',
          description: null,
          isPrebuilt: true,
          sampleText: 'private',
        },
        {
          id: 'required-style',
          userId: 'owner',
          name: 'Required',
          description: null,
          isPrebuilt: false,
          sampleText: 'private',
        },
        {
          id: 'unrelated-style',
          userId: 'owner',
          name: 'Unrelated',
          description: null,
          isPrebuilt: false,
          sampleText: 'private',
        },
      ]),
    },
    sessions: { create: vi.fn(), archive: vi.fn(), seedDraft: vi.fn() },
    cms: {
      forPublication: vi.fn(async () => cms as unknown as CmsClient),
      isNotFound: (error: unknown) =>
        error instanceof Error && error.message === 'missing',
    },
    provisioning: {
      provision: vi.fn(async () => {}),
      deprovision: vi.fn(async () => {}),
    },
    feeds: { regenerate: vi.fn() },
    renderMarkdown: vi.fn(async (markdown: string) => `<p>${markdown}</p>`),
    warn: vi.fn(),
    newId: () => 'new',
    now: () => Date.parse('2026-10-29T10:00:00Z'),
    defaultCmsProvider: 'emdash' as const,
  } satisfies ContentDependencies
  return { deps, cms, connection }
}
