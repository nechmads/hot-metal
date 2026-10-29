import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { MCP_SCOPES, type McpAction } from '@hotmetal/content-core'
import type { AuthenticatedCaller } from '../bl/caller'
import { BusinessError } from '../bl/errors'
import { BusinessOperationError, getMe, listPublications, getPublication, listPosts, createPost, updatePost, updatePublication, listIdeas, getIdea, listStyles } from '../bl/content'
import { listTopics, createTopic, updateTopic, deleteTopic } from '../bl/topics'
import { submitGeneration, getGenerationJob, getSession, getDraftVersion, updateDraft, publishDraft, runScout } from '../bl/generation'
import { createContentDependencies } from '../infrastructure/content-dependencies'
import { createTopicDependencies } from '../infrastructure/topic-dependencies'
import { createGenerationDependencies } from '../infrastructure/generation-dependencies'
import { logger } from '@hotmetal/shared'

const id = z.string().min(1).max(200)
const text = z.string().max(5000)
const postFields = {
  title: z.string().max(500).optional(), markdown: z.string().max(500_000).optional(),
  slug: text.optional(), status: z.enum(['draft', 'published']).optional(),
  author: text.optional(), subtitle: text.optional(), hook: text.optional(), excerpt: text.optional(),
  tags: text.optional(), topics: text.optional(), featuredImage: text.optional(), ogImage: text.optional(),
  seoTitle: text.optional(), seoDescription: text.optional(), canonicalUrl: text.optional(), publishedAt: text.optional(),
  citations: z.array(z.object({ url: text, title: text, publisher: text.optional(), accessedAt: text.optional(), excerpt: text.optional() })).max(200).optional(),
}
/** Each request gets its own tools/caller; every operation rechecks live BL policy. */
export function createMcpServer(caller: AuthenticatedCaller, env: Env, context: ExecutionContext) {
  const server = new McpServer({ name: 'hot-metal', version: '1.0.0' })
  const content = createContentDependencies(env, context)
  const topics = createTopicDependencies(env.DAL, { mcpEnabled: env.MCP_ENABLED === 'true' })
  const generation = createGenerationDependencies(env)
  function tool<Shape extends z.ZodRawShape>(name: string, description: string, shape: Shape,
    action: McpAction, operation: (input: z.output<z.ZodObject<Shape>>) => Promise<unknown>, idempotent = false) {
    // Reduces noise for read-only connections; BL is still the security boundary.
    if (!caller.scopes?.includes(MCP_SCOPES[action])) return
    server.registerTool(name, {
      description, inputSchema: z.object(shape),
      annotations: { readOnlyHint: action === 'read', destructiveHint: action !== 'read', idempotentHint: action === 'read' || idempotent, openWorldHint: action !== 'read' },
    }, async (input) => {
      try {
        const value = await operation(input as z.output<z.ZodObject<Shape>>)
        const structuredContent = value !== null && typeof value === 'object' && !Array.isArray(value)
          ? value as Record<string, unknown> : { data: value }
        return { content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }], structuredContent }
      } catch (error) {
        const known = error instanceof BusinessError || error instanceof BusinessOperationError
        const failure = { error: known ? error.message : 'The operation could not be completed. Please try again or check Hot Metal.', code: known ? error.code : 'INTERNAL_ERROR' }
        logger('web').warn('MCP tool failed', { component: 'mcp', tool: name, code: failure.code, connectionId: caller.connectionId })
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(failure) }] }
      }
    })
  }
  tool('getMe', 'Get the connected Hot Metal account name and plan.', {}, 'read', () => getMe(caller, content))
  tool('listPublications', 'List only publications accessible to this connection.', {}, 'read', () => listPublications(caller, content))
  tool('getPublication', 'Read publication details and topics.', { publicationId: id }, 'read', ({ publicationId }) => getPublication(caller, publicationId, content))
  tool('listPosts', 'List published posts in an authorized publication. Use limit and offset to page.', { publicationId: id, limit: z.number().int().min(1).max(100).optional(), offset: z.number().int().nonnegative().optional() }, 'read', (input) => listPosts(caller, input, content))
  tool('createPost', 'Store authored Markdown as a draft by default. Publishing requires separate publish permission.', { ...postFields, publicationId: id, title: z.string().min(1).max(500), markdown: z.string().min(1).max(500_000) }, 'write', (input) => createPost(caller, input, content))
  tool('updatePost', 'Update authored content. All updates to existing CMS posts require publish permission. Use updateDraft for write-only writer-session edits.', { ...postFields, publicationId: id, postId: id }, 'write', (input) => updatePost(caller, input, content))
  tool('updatePublication', 'Update publication content settings. Recurring automation, lifecycle and CMS linkage changes are not available through this connector.', { publicationId: id, name: text.optional(), description: text.optional(), writingTone: text.optional(), defaultAuthor: text.optional(), templateId: text.optional() }, 'write', (input) => updatePublication(caller, input, content))
  tool('listTopics', 'List topics in an authorized publication.', { publicationId: id }, 'read', ({ publicationId }) => listTopics(caller, publicationId, topics))
  tool('createTopic', 'Create a topic. Priority is 1 Normal, 2 High or 3 Urgent; defaults to 1.', { publicationId: id, name: z.string().min(1).max(500), description: text.optional(), priority: z.number().int().min(1).max(3).optional() }, 'write', (input) => createTopic(caller, input, topics))
  tool('updateTopic', 'Update a topic owned by an accessible publication.', { topicId: id, name: text.optional(), description: text.nullable().optional(), priority: z.number().int().min(1).max(3).optional(), isActive: z.boolean().optional() }, 'write', ({ topicId, ...input }) => updateTopic(caller, topicId, input, topics))
  tool('deleteTopic', 'Delete a topic from an accessible publication.', { topicId: id }, 'write', async ({ topicId }) => { await deleteTopic(caller, topicId, topics); return { deleted: true } })
  tool('listIdeas', 'List discovered ideas within an authorized publication.', { publicationId: id, status: z.enum(['new', 'reviewed', 'promoted', 'dismissed']).optional() }, 'read', (input) => listIdeas(caller, input, content))
  tool('getIdea', 'Read an idea only if its actual publication is accessible.', { ideaId: id }, 'read', ({ ideaId }) => getIdea(caller, ideaId, content))
  tool('listStyles', 'List prebuilt and publication-required writing styles allowed by this connection.', {}, 'read', () => listStyles(caller, content))
  tool('generateDraft', 'Start durable AI draft generation and return a job/session ID immediately. Reuse the same idempotencyKey for retries. Poll getGenerationJob then retrieve the draft. Auto-publish requires publish permission.', { publicationId: id, title: z.string().min(1).max(500), instructions: z.string().min(1).max(100_000), styleId: id.optional(), autoPublish: z.boolean().optional(), idempotencyKey: z.string().min(1).max(200) }, 'write', (input) => submitGeneration(caller, input, generation), true)
  tool('getGenerationJob', 'Get durable generation progress. A publish_unknown result requires reconciliation; do not resubmit publishing automatically.', { jobId: id }, 'read', ({ jobId }) => getGenerationJob(caller, jobId, generation))
  tool('getSession', 'Read the status and draft summary of an authorized writing session.', { sessionId: id }, 'read', ({ sessionId }) => getSession(caller, sessionId, generation))
  tool('getDraftVersion', 'Read a saved draft version in an authorized session.', { sessionId: id, version: z.number().int().min(1) }, 'read', ({ sessionId, version }) => getDraftVersion(caller, sessionId, version, generation))
  tool('updateDraft', 'Edit a saved writer-session draft without changing a live CMS post. Publishing is a separate operation.', { sessionId: id, content: z.string().min(1).max(500_000), title: z.string().max(500).optional(), version: z.number().int().min(1).optional() }, 'write', ({ sessionId, ...input }) => updateDraft(caller, sessionId, input, generation))
  tool('publishDraft', 'Publish an authorized session draft. Optional social shares additionally require explicit consent for each configured outlet.', { sessionId: id, slug: text.optional(), author: text.optional(), tags: text.optional(), excerpt: text.optional(), draftVersion: z.number().int().min(1).optional(), publishToLinkedIn: z.boolean().optional(), publishToTwitter: z.boolean().optional(), linkedInText: z.string().max(3000).optional(), tweetText: z.string().max(280).optional() }, 'publish', (input) => publishDraft(caller, input, generation))
  tool('runScout', 'Run content discovery for an authorized publication. If existing full-auto settings can publish, publish permission is also required.', { publicationId: id }, 'write', (input) => runScout(caller, input, generation))
  return server
}
