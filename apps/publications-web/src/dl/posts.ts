import type { Post } from '@hotmetal/content-core'
import { CmsApi } from '@hotmetal/shared'

interface Env {
  CMS_URL: string
  CMS_API_KEY: string
}

function getCmsApi(env: Env): CmsApi {
  return new CmsApi(env.CMS_URL, env.CMS_API_KEY)
}

export async function listPublishedPosts(
  env: Env,
  cmsPublicationId: string,
  options?: { limit?: number; offset?: number }
): Promise<Post[]> {
  const cmsApi = getCmsApi(env)
  const result = await cmsApi.listPosts({
    publicationId: cmsPublicationId,
    status: 'published',
    limit: options?.limit,
    offset: options?.offset,
  })
  return result.data
}

export async function getPostBySlug(
  env: Env,
  slug: string,
  cmsPublicationId: string
): Promise<Post | null> {
  const cmsApi = getCmsApi(env)
  const result = await cmsApi.listPosts({
    publicationId: cmsPublicationId,
    status: 'published',
    slug,
  })

  const post = result.data.find((p) => p.slug === slug)
  return post ?? null
}
