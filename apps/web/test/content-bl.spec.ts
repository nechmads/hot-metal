import { describe, it, expect } from 'vitest'
import {
  BusinessForbiddenError,
  BusinessValidationError,
} from '../src/bl/errors'
import {
  createPost,
  updatePost,
  listPublications,
  getPublication,
  listPosts,
  listStyles,
  getStyle,
  getMe,
  listIdeas,
  updatePublication,
  createPublication,
  deletePublication,
} from '../src/bl/content'

import {
  owner,
  mcp,
  publication,
  currentPost,
  fixture,
} from './content-fixtures'

describe('shared content BL', () => {
  it('preserves all owned REST publications and filters selected MCP publications', async () => {
    const { deps } = fixture()
    expect(await listPublications(owner, deps)).toHaveLength(2)
    const selected = await listPublications(mcp, deps)
    expect(selected).toHaveLength(1)
    expect(selected[0]).toMatchObject({ id: 'pub', name: 'Test' })
    expect(selected[0]).not.toHaveProperty('cmsBaseUrl')
    expect(selected[0]).not.toHaveProperty('cmsInstanceMeta')
    expect(selected[0]).not.toHaveProperty('cmsPublicationId')
  })
  it('all grants include future owned publications', async () => {
    const { deps, connection } = fixture()
    connection.publicationMode = 'all'
    connection.publicationIds = []
    expect(await listPublications(mcp, deps)).toHaveLength(2)
  })
  it('a selected grant cannot read a guessed publication', async () => {
    const { deps } = fixture()
    await expect(getPublication(mcp, 'other', deps)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(deps.topics.listByPublication).not.toHaveBeenCalled()
  })
  it('MCP account/style context omits unrelated samples and private email', async () => {
    const { deps } = fixture()
    expect(await getMe(mcp, deps)).not.toHaveProperty('email')
    const styles = await listStyles(mcp, deps)
    expect(styles.map((style) => style.id)).toEqual([
      'prebuilt',
      'required-style',
    ])
    expect(styles[0]).not.toHaveProperty('sampleText')
  })
  it('single style reads use the same owned/prebuilt list and MCP projection', async () => {
    const { deps } = fixture()
    expect(await getStyle(owner, 'unrelated-style', deps)).toHaveProperty(
      'sampleText',
      'private',
    )
    expect(await getStyle(mcp, 'required-style', deps)).not.toHaveProperty(
      'sampleText',
    )
    await expect(getStyle(mcp, 'unrelated-style', deps)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(getStyle(owner, 'foreign', deps)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
  it('MCP kill switch fails closed even with a valid connection', async () => {
    const { deps } = fixture()
    deps.mcpEnabled = false
    await expect(listPublications(mcp, deps)).rejects.toBeInstanceOf(
      BusinessForbiddenError,
    )
  })
  it('REST authored posts retain default published while MCP defaults draft', async () => {
    const { deps, cms } = fixture()
    const rest = await createPost(
      owner,
      { publicationId: 'pub', title: 'Hello', markdown: 'Text' },
      deps,
    )
    expect(rest.status).toBe('published')
    expect(deps.feeds.regenerate).toHaveBeenCalledWith('test')
    cms.createPost.mockClear()
    deps.feeds.regenerate.mockClear()
    const draft = await createPost(
      mcp,
      { publicationId: 'pub', title: 'Hello', markdown: 'Text' },
      deps,
    )
    expect(draft.status).toBe('draft')
    expect(deps.feeds.regenerate).not.toHaveBeenCalled()
  })
  it('write-only MCP cannot explicitly publish', async () => {
    const { deps, cms, connection } = fixture()
    connection.actions = ['read', 'write']
    await expect(
      createPost(
        mcp,
        {
          publicationId: 'pub',
          title: 'Hello',
          markdown: 'Text',
          status: 'published',
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(BusinessForbiddenError)
    expect(cms.createPost).not.toHaveBeenCalled()
  })
  it('write-only MCP cannot edit or unpublish an already live post', async () => {
    const { deps, cms, connection } = fixture()
    connection.actions = ['read', 'write']
    cms.getPost.mockResolvedValue({ ...currentPost, status: 'published' })
    await expect(
      updatePost(
        mcp,
        {
          publicationId: 'pub',
          postId: 'post',
          markdown: 'New',
          status: 'draft',
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(BusinessForbiddenError)
    expect(cms.updatePost).not.toHaveBeenCalled()
  })
  it.each(['sonicjs', 'emdash'] as const)(
    'write-only MCP cannot update an apparently draft %s post that becomes live',
    async (provider) => {
      const { deps, cms, connection } = fixture()
      connection.actions = ['read', 'write']
      deps.publications.getById.mockResolvedValue({
        ...publication,
        cmsProvider: provider,
      })
      // Model the CMS returning an old draft snapshot after another writer
      // publishes. A second read would still leave a race before mutation.
      let livePost = { ...currentPost }
      cms.getPost.mockImplementation(async () => {
        const snapshot = { ...livePost }
        livePost = { ...livePost, status: 'published' }
        return snapshot
      })
      cms.updatePost.mockImplementation(async (_id, updates) => {
        livePost = { ...livePost, ...updates }
        return livePost
      })
      await expect(
        updatePost(
          mcp,
          { publicationId: 'pub', postId: 'post', markdown: 'Changed' },
          deps,
        ),
      ).rejects.toBeInstanceOf(BusinessForbiddenError)
      expect(cms.updatePost).not.toHaveBeenCalled()
      expect(deps.cms.forPublication).not.toHaveBeenCalled()
    },
  )
  it('requires publish scope even when the live grant allows draft updates', async () => {
    const { deps, cms } = fixture()
    await expect(
      updatePost(
        { ...mcp, scopes: ['hotmetal:read', 'hotmetal:write'] },
        { publicationId: 'pub', postId: 'post', title: 'Changed' },
        deps,
      ),
    ).rejects.toBeInstanceOf(BusinessForbiddenError)
    expect(cms.updatePost).not.toHaveBeenCalled()
  })
  it('rechecks publish permission after a draft becomes live during rendering', async () => {
    const { deps, cms, connection } = fixture()
    let livePost = { ...currentPost }
    deps.renderMarkdown.mockImplementation(async () => {
      livePost = { ...livePost, status: 'published' }
      connection.actions = ['read', 'write']
      return '<p>Changed</p>'
    })
    cms.updatePost.mockImplementation(async (_id, updates) => {
      livePost = { ...livePost, ...updates }
      return livePost
    })
    await expect(
      updatePost(
        mcp,
        { publicationId: 'pub', postId: 'post', markdown: 'Changed' },
        deps,
      ),
    ).rejects.toBeInstanceOf(BusinessForbiddenError)
    expect(livePost.status).toBe('published')
    expect(cms.updatePost).not.toHaveBeenCalled()
  })
  it('revocation during Markdown rendering blocks the final write', async () => {
    const { deps, cms, connection } = fixture()
    deps.renderMarkdown.mockImplementation(async () => {
      connection.state = 'revoked'
      return '<p>Rendered</p>'
    })
    await expect(
      createPost(
        mcp,
        { publicationId: 'pub', title: 'Hello', markdown: 'Text' },
        deps,
      ),
    ).rejects.toBeInstanceOf(BusinessForbiddenError)
    expect(cms.createPost).not.toHaveBeenCalled()
  })
  it('prevents cross-publication SonicJS post writes', async () => {
    const { deps, cms } = fixture()
    cms.getPost.mockResolvedValue({ ...currentPost, publicationId: 'foreign' })
    await expect(
      updatePost(
        owner,
        { publicationId: 'pub', postId: 'post', markdown: 'New' },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(cms.updatePost).not.toHaveBeenCalled()
  })
  it('does not classify an upstream outage as missing content', async () => {
    const { deps, cms } = fixture()
    const outage = new Error('upstream-down')
    cms.getPost.mockRejectedValue(outage)
    await expect(
      updatePost(
        owner,
        { publicationId: 'pub', postId: 'post', markdown: 'New' },
        deps,
      ),
    ).rejects.toBe(outage)
  })
  it('validates authored input before opening CMS connections', async () => {
    const { deps } = fixture()
    await expect(
      updatePost(
        owner,
        { publicationId: 'pub', postId: 'post', markdown: 42 },
        deps,
      ),
    ).rejects.toBeInstanceOf(BusinessValidationError)
    expect(deps.cms.forPublication).not.toHaveBeenCalled()
  })
  it('preserves slug conflicts without a write', async () => {
    const { deps, cms } = fixture()
    cms.listPosts.mockResolvedValue({
      data: [{ ...currentPost, slug: 'hello' }],
    })
    await expect(
      createPost(
        owner,
        { publicationId: 'pub', title: 'Hello', markdown: 'Text' },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(cms.createPost).not.toHaveBeenCalled()
  })
  it('uses original publishedAt and reasserts live status for date edits', async () => {
    const { deps, cms } = fixture()
    cms.getPost.mockResolvedValue({ ...currentPost, status: 'published' })
    await updatePost(
      owner,
      { publicationId: 'pub', postId: 'post', publishedAt: '2026-01-03' },
      deps,
    )
    expect(cms.updatePost).toHaveBeenCalledWith(
      'post',
      expect.objectContaining({
        status: 'published',
        publishedAt: '2026-01-03T00:00:00.000Z',
      }),
    )
  })
  it('returns an empty unlinked post list without meta just like REST', async () => {
    const { deps, cms } = fixture()
    deps.publications.getById.mockResolvedValue({
      ...publication,
      cmsPublicationId: null,
    })
    expect(await listPosts(owner, { publicationId: 'pub' }, deps)).toEqual({
      data: [],
    })
    expect(cms.listPosts).not.toHaveBeenCalled()
  })
  it('validates page boundaries and preserves meta', async () => {
    const { deps } = fixture()
    await expect(
      listPosts(owner, { publicationId: 'pub', limit: 101 }, deps),
    ).rejects.toBeInstanceOf(BusinessValidationError)
    expect(
      await listPosts(
        owner,
        { publicationId: 'pub', limit: 10, offset: 20 },
        deps,
      ),
    ).toEqual({ data: [], meta: { limit: 10, offset: 20 } })
  })
  it('MCP rejects automation and CMS-field changes even with publish scope', async () => {
    const { deps } = fixture()
    await expect(
      updatePublication(
        mcp,
        { publicationId: 'pub', autoPublishMode: 'full-auto' },
        deps,
      ),
    ).rejects.toBeInstanceOf(BusinessForbiddenError)
    await expect(
      updatePublication(
        mcp,
        { publicationId: 'pub', cmsPublicationId: 'foreign' },
        deps,
      ),
    ).rejects.toBeInstanceOf(BusinessForbiddenError)
    expect(deps.publications.update).not.toHaveBeenCalled()
  })
  it('reschedules paused publications without inadvertently arming them', async () => {
    const { deps } = fixture()
    deps.publications.getById.mockResolvedValue({
      ...publication,
      scoutEnabled: false,
    })
    await updatePublication(
      owner,
      { publicationId: 'pub', timezone: 'Europe/London' },
      deps,
    )
    expect(deps.publications.update).toHaveBeenCalledWith(
      'pub',
      expect.objectContaining({ nextScoutAt: null }),
    )
  })
  it('MCP cannot create or delete publications', async () => {
    const { deps } = fixture()
    await expect(
      createPublication(mcp, { name: 'Name', slug: 'name' }, deps),
    ).rejects.toBeInstanceOf(BusinessForbiddenError)
    await expect(deletePublication(mcp, 'pub', deps)).rejects.toBeInstanceOf(
      BusinessForbiddenError,
    )
    expect(deps.publications.create).not.toHaveBeenCalled()
    expect(deps.publications.delete).not.toHaveBeenCalled()
  })
  it('does not delete a publication when EmDash teardown fails', async () => {
    const { deps } = fixture()
    deps.publications.getById.mockResolvedValue({
      ...publication,
      cmsProvider: 'emdash',
    })
    deps.provisioning.deprovision.mockRejectedValue(new Error('down'))
    await expect(deletePublication(owner, 'pub', deps)).rejects.toMatchObject({
      code: 'DEPROVISION_FAILED',
    })
    expect(deps.publications.delete).not.toHaveBeenCalled()
  })
  it('validates idea filter status before querying ideas', async () => {
    const { deps } = fixture()
    await expect(
      listIdeas(owner, { publicationId: 'pub', status: 'bad' }, deps),
    ).rejects.toBeInstanceOf(BusinessValidationError)
    expect(deps.ideas.listByPublication).not.toHaveBeenCalled()
  })
})
