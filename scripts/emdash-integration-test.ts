/**
 * Manual integration test for EmdashCmsClient against a REAL running EmDash
 * instance (the Phase-1 spike, or any instance seeded with `emdash/seed.json`).
 *
 * This exercises the exact write-path client the WriterAgent / publisher use,
 * end-to-end: create (markdown→Portable Text) → publish → read back → list →
 * renditions. It validates the lossless round-trip of our Post/Rendition fields.
 *
 * Prereqs:
 *   1. EmDash running and reachable at BASE_URL, seeded with emdash/seed.json
 *      (posts + renditions collections).
 *   2. A valid ec_pat_ token (mint via ../emdash-spike/src/seed-live-d1.ts).
 *
 * Usage:
 *   BASE_URL=http://localhost:4321 PAT=ec_pat_... pnpm tsx scripts/emdash-integration-test.ts
 */
import { EmdashCmsClient } from '../packages/shared/src/emdash-cms-client'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4321'
const PAT = process.env.PAT

if (!PAT) {
  console.error('✗ Set PAT=ec_pat_... (and optionally BASE_URL). See script header.')
  process.exit(2)
}

let failures = 0
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`  ✓ ${label}`)
  } else {
    failures++
    console.error(`  ✗ ${label}${detail !== undefined ? ` — got: ${JSON.stringify(detail)}` : ''}`)
  }
}

async function main() {
  const client = new EmdashCmsClient(BASE_URL, PAT!)
  const stamp = Date.now()
  const slug = `itest-${stamp}`
  const markdown =
    '# It works\n\nA paragraph with a [link](https://example.com) and **bold** text.\n\n- one\n- two\n\n```js\nconst x = 1\n```'
  const html =
    '<h1>It works</h1><p>A paragraph with a <a href="https://example.com">link</a> and <strong>bold</strong> text.</p>'
  const citations = [{ url: 'https://example.com', title: 'Example Source', publisher: 'Example' }]

  console.log('\n1) createPost (status: published) — markdown→PT, then publish')
  const created = await client.createPost({
    title: 'Integration Test Post',
    subtitle: 'A subtitle',
    slug,
    hook: 'A compelling hook.',
    content: html,
    markdown,
    excerpt: 'An excerpt for SEO.',
    status: 'published',
    author: 'Tester',
    tags: 'alpha,beta',
    topics: 'topic-one',
    citations,
    seoTitle: 'SEO Title',
    seoDescription: 'SEO description.',
    publicationId: 'pub-itest-123',
    featuredImage: 'https://example.com/img.png',
    publishedAt: new Date().toISOString(),
  })
  check('created has id', !!created.id, created.id)
  check('created slug matches', created.slug === slug, created.slug)
  check('created status is published', created.status === 'published', created.status)

  console.log('\n2) getPost — round-trip our fields')
  const got = await client.getPost(created.id)
  check('title round-trips', got.title === 'Integration Test Post', got.title)
  check('subtitle round-trips', got.subtitle === 'A subtitle', got.subtitle)
  check('hook round-trips', got.hook === 'A compelling hook.', got.hook)
  check('markdown round-trips losslessly', got.markdown === markdown, got.markdown)
  check('content (html) round-trips', got.content === html, got.content)
  check('excerpt round-trips', got.excerpt === 'An excerpt for SEO.', got.excerpt)
  check('status preserved (published)', got.status === 'published', got.status)
  check('author round-trips', got.author === 'Tester', got.author)
  check('tags round-trip', got.tags === 'alpha,beta', got.tags)
  check('topics round-trip', got.topics === 'topic-one', got.topics)
  check('seoTitle round-trips', got.seoTitle === 'SEO Title', got.seoTitle)
  check('publicationId round-trips', got.publicationId === 'pub-itest-123', got.publicationId)
  check('featuredImage round-trips', got.featuredImage === 'https://example.com/img.png', got.featuredImage)
  check('citations round-trip (1 item)', Array.isArray(got.citations) && got.citations.length === 1, got.citations)
  check('citation url preserved', got.citations?.[0]?.url === 'https://example.com', got.citations?.[0])

  console.log('\n3) listPosts(status: published) — includes our post')
  const published = await client.listPosts({ status: 'published', limit: 50 })
  check('published list contains our post', published.data.some((p) => p.id === created.id), published.data.length)

  console.log('\n4) createPost (status: draft) — stays draft, excluded from published list')
  const draft = await client.createPost({
    title: 'Draft Post',
    slug: `itest-draft-${stamp}`,
    content: '<p>draft</p>',
    markdown: 'draft body',
    status: 'draft',
    author: 'Tester',
  })
  check('draft status is draft', draft.status === 'draft', draft.status)
  const published2 = await client.listPosts({ status: 'published', limit: 50 })
  check('draft excluded from published list', !published2.data.some((p) => p.id === draft.id))

  console.log('\n5) updatePost — publish the draft')
  const updated = await client.updatePost(draft.id, { status: 'published' })
  check('draft now published after update', updated.status === 'published', updated.status)

  console.log('\n6) renditions — create + list')
  const rendition = await client.createRendition({
    postId: created.id,
    outlet: 'linkedin',
    content: 'LinkedIn rendition text',
    status: 'ready',
    externalUrl: 'https://linkedin.com/post/123',
  })
  check('rendition has id', !!rendition.id, rendition.id)
  check('rendition outlet preserved', rendition.outlet === 'linkedin', rendition.outlet)
  check('rendition content preserved', rendition.content === 'LinkedIn rendition text', rendition.content)
  check('rendition status preserved', rendition.status === 'ready', rendition.status)
  const rlist = await client.listRenditions({ postId: created.id })
  check('rendition list contains it', rlist.data.some((r) => r.id === rendition.id), rlist.data.length)

  console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('\n✗ integration-test error:', e)
  process.exit(1)
})
