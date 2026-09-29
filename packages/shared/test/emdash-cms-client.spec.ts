import { describe, expect, it } from 'vitest'
import { EmdashCmsClient, type TenantFetcher } from '../src/emdash-cms-client'

function jsonFetcher(payload: unknown): TenantFetcher {
  return {
    async fetch() {
      return Response.json(payload)
    },
  }
}

describe('EmdashCmsClient wire contract', () => {
  it('maps the camelCase timestamps returned by the EmDash 1.x REST API', async () => {
    const client = new EmdashCmsClient('https://example.test', 'ec_pat_test', {
      fetcher: jsonFetcher({
        success: true,
        data: {
          items: [
            {
              id: 'post-1',
              slug: 'rest-contract',
              status: 'published',
              createdAt: '2026-09-01T10:00:00.000Z',
              updatedAt: '2026-09-02T11:00:00.000Z',
              publishedAt: '2026-09-03T12:00:00.000Z',
              scheduledAt: '2026-09-03T11:00:00.000Z',
              data: {
                title: 'REST contract',
                author: 'Hot Metal',
                html: '<p>Body</p>',
                hm_status: 'published',
              },
            },
          ],
        },
      }),
    })

    const { data } = await client.listPosts()

    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-02T11:00:00.000Z',
      publishedAt: '2026-09-03T12:00:00.000Z',
      scheduledAt: '2026-09-03T11:00:00.000Z',
    })
  })

  it('maps rendition timestamps from the same REST response shape', async () => {
    const client = new EmdashCmsClient('https://example.test', 'ec_pat_test', {
      fetcher: jsonFetcher({
        success: true,
        data: {
          items: [
            {
              id: 'rendition-1',
              slug: 'post-1-linkedin',
              status: 'draft',
              createdAt: '2026-09-04T10:00:00.000Z',
              updatedAt: '2026-09-05T11:00:00.000Z',
              data: {
                post_id: 'post-1',
                outlet: 'linkedin',
                content: 'Rendition body',
                rendition_status: 'draft',
              },
            },
          ],
        },
      }),
    })

    const { data } = await client.listRenditions()

    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({
      createdAt: '2026-09-04T10:00:00.000Z',
      updatedAt: '2026-09-05T11:00:00.000Z',
    })
  })
})
