/**
 * Live verification of `EmdashCmsClient`'s update path against a real EmDash
 * instance. Complements `scripts/emdash-integration-test.ts`, which covers
 * create/read/publish; this one covers the parts that only misbehave against a
 * running instance, and asserts them the only honest way.
 *
 * The model it pins down (step 1 proves it, rather than assuming it): on a
 * collection that supports revisions — the fleet's `posts` does — a PUT stages a
 * draft revision and does NOT write the content columns. Publish promotes the
 * revision into them. So an edit to a published post must republish or it never
 * reaches the blog, and every assertion here reads back through the LIST
 * endpoint, because the single-entry GET hydrates the pending draft revision
 * over its response and would happily report an edit that never went live.
 *
 * Usage (from the repo root, against a local instance):
 *   1. run an EmDash instance (see docs/emdash-integration-guide.md)
 *   2. BASE_URL=http://localhost:4321 PAT=ec_pat_... pnpm tsx scripts/emdash-update-path-test.ts
 *
 * It creates one post per run and leaves it archived; point it at a scratch
 * instance, never at a production tenant.
 */
import { EmdashCmsClient } from '../packages/shared/src/emdash-cms-client'

const BASE = process.env.BASE_URL
const PAT = process.env.PAT
if (!BASE || !PAT) {
  console.error('✗ Set BASE_URL and PAT. See the script header.')
  process.exit(2)
}
const client = new EmdashCmsClient(BASE, PAT)

let pass = 0, fail = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { console.log(`  ✓ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); fail++ }
}

/** Raw API access, to observe what the client's abstractions hide. */
async function raw(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}/_emdash/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, json: (await res.json().catch(() => ({}))) as any }
}

/** The list endpoint serves the content COLUMNS — what the blog renders. */
async function titleInList(slug: string): Promise<string | undefined> {
  const { json } = await raw('GET', `/content/posts?limit=100`)
  return (json?.data?.items ?? []).find((e: any) => e.slug === slug)?.data?.title
}

const slug = `verify-update-${Date.now()}`

async function main() {
  console.log(`\nEmDash update-path verification against ${BASE}\n`)

  console.log('0) create a published post')
  const created = await client.createPost({
    title: 'A — original', slug, content: '<p>a</p>', markdown: '# a', status: 'published',
    author: 'Verifier', publishedAt: '2026-01-15T10:00:00.000Z',
  })
  check('created and published', created.status === 'published')
  check('create lands in the columns', (await titleInList(slug)) === 'A — original', `list says ${await titleInList(slug)}`)
  check('backdate reached the system column', created.publishedAt?.startsWith('2026-01-15'), `got ${created.publishedAt}`)

  console.log('\n1) THE MODEL: a bare PUT stages a draft revision, it does NOT write the columns')
  const put = await raw('PUT', `/content/posts/${created.id}`, { data: { title: 'B — via raw PUT' } })
  check('raw PUT accepted', put.status === 200, `got ${put.status}`)
  const singleGet = await raw('GET', `/content/posts/${created.id}`)
  check('single GET hydrates the draft revision (shows the new title)', singleGet.json?.data?.item?.data?.title === 'B — via raw PUT', `got ${singleGet.json?.data?.item?.data?.title}`)
  check('LIST still shows the OLD title — the columns are untouched', (await titleInList(slug)) === 'A — original', `list says ${await titleInList(slug)}`)

  console.log('\n2) THE FIX: updatePost with no status must republish so the edit goes live')
  await client.updatePost(created.id, { title: 'C — via client', markdown: '# c' })
  check('edit reached the columns', (await titleInList(slug)) === 'C — via client', `list says ${await titleInList(slug)}`)

  console.log('\n3) date correction on a live post must not revert the fields')
  const dated = await client.updatePost(created.id, { publishedAt: '2025-06-01T08:00:00.000Z', status: 'published' })
  check('publishedAt moved', dated.publishedAt?.startsWith('2025-06-01'), `got ${dated.publishedAt}`)
  check('title survived the date change', (await titleInList(slug)) === 'C — via client', `list says ${await titleInList(slug)}`)

  console.log('\n4) published → draft → published, with an edit on the way back')
  const draft = await client.updatePost(created.id, { status: 'draft' })
  check('status is draft', draft.status === 'draft', `got ${draft.status}`)
  const pubList = await client.listPosts({ status: 'published', limit: 100 })
  check('excluded from the published list', !pubList.data.some((p) => p.slug === slug))

  await client.updatePost(created.id, { title: 'D — republished', status: 'published' })
  check('edit survives the round-trip', (await titleInList(slug)) === 'D — republished', `list says ${await titleInList(slug)}`)

  console.log('\n5) slug lookup is exact and single-request')
  const bySlug = await client.listPosts({ slug, limit: 100 })
  check('finds the post by slug', bySlug.data.length === 1 && bySlug.data[0]?.slug === slug, `got ${bySlug.data.length} rows`)
  const missing = await client.listPosts({ slug: 'definitely-not-a-real-slug-xyz', limit: 100 })
  check('absent slug returns empty, not an error', missing.data.length === 0)

  console.log('\n6) archived comes off the blog (used to 400)')
  const archived = await client.updatePost(created.id, { status: 'archived' })
  check('our status is preserved', archived.status === 'archived', `got ${archived.status}`)
  const stillLive = await client.listPosts({ status: 'published', limit: 100 })
  check('no longer in the published list', !stillLive.data.some((p) => p.slug === slug))

  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
