import { describe, expect, it, vi } from 'vitest'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server'
import type { ContentDependencies } from '../src/bl/content'
const state = vi.hoisted(() => ({ deps: null as ContentDependencies | null }))
vi.mock('../src/infrastructure/content-dependencies', () => ({
  createContentDependencies: () => state.deps,
}))
vi.mock('../src/infrastructure/topic-dependencies', () => ({
  createTopicDependencies: () => ({}),
}))
vi.mock('../src/infrastructure/generation-dependencies', () => ({
  createGenerationDependencies: () => ({}),
}))
vi.mock('@hotmetal/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@hotmetal/shared')>()),
  logger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}))
import { createMcpServer } from '../src/mcp/server'
import { fixture, mcp, publication, currentPost } from './content-fixtures'

async function updateOverHttp() {
  const server = createMcpServer(
    mcp,
    { MCP_ENABLED: 'true' } as Env,
    {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: {},
    } as unknown as ExecutionContext,
  )
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  try {
    const response = await transport.handleRequest(
      new Request('https://hotmetal.test/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': '2025-11-25',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'updatePost',
            arguments: {
              publicationId: 'pub',
              postId: 'post',
              markdown: 'Changed',
            },
          },
        }),
      }),
    )
    const body = (await response.json()) as {
      result: {
        isError?: boolean
        content: { text: string }[]
        structuredContent?: Record<string, unknown>
      }
    }
    return { status: response.status, body }
  } finally {
    await server.close()
  }
}

describe('MCP existing-CMS-post update HTTP policy', () => {
  it.each(['sonicjs', 'emdash'] as const)(
    'write-only connections cannot race a concurrent %s publication',
    async (provider) => {
      const { deps, cms, connection } = fixture()
      state.deps = deps
      connection.actions = ['read', 'write']
      deps.publications.getById.mockResolvedValue({
        ...publication,
        cmsProvider: provider,
      })
      cms.getPost.mockImplementation(async () => {
        const staleDraft = { ...currentPost }
        cms.updatePost.mockResolvedValue({
          ...currentPost,
          status: 'published',
        })
        return staleDraft
      })
      const response = await updateOverHttp()
      expect(response.status).toBe(200)
      expect(response.body.result.isError).toBe(true)
      expect(JSON.parse(response.body.result.content[0].text)).toMatchObject({
        code: 'FORBIDDEN',
      })
      expect(cms.updatePost).not.toHaveBeenCalled()
    },
  )
  it('publish-authorized connections can still update CMS drafts', async () => {
    const { deps, cms } = fixture()
    state.deps = deps
    const response = await updateOverHttp()
    expect(response.status).toBe(200)
    expect(response.body.result.isError).not.toBe(true)
    expect(response.body.result.structuredContent).toMatchObject({
      id: 'post',
      markdown: 'Changed',
      status: 'draft',
    })
    expect(cms.updatePost).toHaveBeenCalledOnce()
  })
})
