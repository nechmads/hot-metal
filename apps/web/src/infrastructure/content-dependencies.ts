import { getAgentByName } from 'agents'
import type { WriterAgent } from '../agent/writer-agent'
import { marked } from 'marked'
import { CmsApiError, getCmsClient, logger } from '@hotmetal/shared'
import {
  triggerEmdashProvision,
  triggerEmdashDeprovision,
} from '../lib/provisioner'
import type { ContentDependencies } from '../bl/content'

type ContentEnvironment = Pick<
  Env,
  | 'DAL'
  | 'CMS_URL'
  | 'CMS_API_KEY'
  | 'EMDASH_DISPATCHER'
  | 'PUBLISHER'
  | 'PUBLISHER_API_KEY'
  | 'PROVISIONER'
  | 'DEFAULT_CMS_PROVIDER'
  | 'WRITER_AGENT'
> & { PROVISIONER_API_KEY?: string; MCP_ENABLED?: string }

/** Runtime wiring for shared content operations, independent of either public protocol. */
export function createContentDependencies(
  env: ContentEnvironment,
  execution?: Pick<ExecutionContext, 'waitUntil'>,
): ContentDependencies {
  const dal = env.DAL
  return {
    mcpEnabled: env.MCP_ENABLED === 'true',
    users: { getById: (id) => dal.getUserById(id) },
    connections: { getById: (id) => dal.getMcpConnectionById(id) },
    publications: {
      getById: (id) => dal.getPublicationById(id),
      listByUser: (id) => dal.listPublicationsByUser(id),
      countByUser: (id) => dal.countPublicationsByUser(id),
      create: (input) =>
        dal.createPublication({
          ...input,
          description: input.description ?? undefined,
          writingTone: input.writingTone ?? undefined,
          styleId: input.styleId ?? undefined,
          cmsProvisioningStatus: input.cmsProvisioningStatus ?? undefined,
        }),
      update: (id, input) => dal.updatePublication(id, input),
      delete: (id) => dal.deletePublication(id),
    },
    topics: { listByPublication: (id) => dal.listTopicsByPublication(id) },
    ideas: {
      getById: (id) => dal.getIdeaById(id),
      listByPublication: (id, filters) =>
        dal.listIdeasByPublication(id, filters),
      countByPublication: (id) => dal.countIdeasByPublication(id),
      recentByPublications: (ids, limit) =>
        dal.listRecentIdeasForUser(ids, limit),
      updateStatus: (id, status) => dal.updateIdeaStatus(id, status),
      dismissByPublications: (ids) => dal.dismissIdeasByPublications(ids),
      deleteByPublications: (ids) => dal.deleteIdeasByPublications(ids),
      promote: (id, sessionId) => dal.promoteIdea(id, sessionId),
    },
    styles: { listByUser: (id) => dal.listWritingStylesByUser(id) },
    sessions: {
      create: (input) => dal.createSession(input),
      archive: (id) => dal.updateSession(id, { status: 'archived' }),
      seedDraft: async (id, draft) => {
        const agent = await getAgentByName<Env, WriterAgent>(
          env.WRITER_AGENT,
          id,
        )
        const result = await agent.fetch(
          new Request('https://internal/seed-draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft),
          }),
        )
        return result.ok
      },
    },
    cms: {
      forPublication: (pub) => getCmsClient(pub, dal, env),
      isNotFound: (error) =>
        error instanceof CmsApiError && error.status === 404,
    },
    provisioning: {
      provision: (id, retry) =>
        triggerEmdashProvision(env, id, retry ? 'retry' : 'create'),
      deprovision: (id) => triggerEmdashDeprovision(env, id),
    },
    feeds: {
      regenerate: (slug) => {
        const task = (async () => {
          try {
            const result = await env.PUBLISHER.fetch(
              new Request(
                `https://publisher/internal/feeds/regenerate/${encodeURIComponent(slug)}`,
                {
                  method: 'POST',
                  headers: { 'X-API-Key': env.PUBLISHER_API_KEY },
                },
              ),
            )
            if (!result.ok)
              logger('web').error('Feed regeneration returned error', {
                component: 'content',
                status: result.status,
                slug,
              })
          } catch (error) {
            logger('web').error('Feed regeneration failed', {
              component: 'content',
              slug,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        })()
        execution?.waitUntil(task)
      },
    },
    renderMarkdown: (markdown) => Promise.resolve(marked.parse(markdown)),
    warn: (message, details) =>
      logger('web').warn(message, { component: 'content', ...details }),
    newId: () => crypto.randomUUID(),
    now: () => Date.now(),
    defaultCmsProvider:
      env.DEFAULT_CMS_PROVIDER === 'emdash' ? 'emdash' : 'sonicjs',
  }
}
