/**
 * Import an exported archive into a publication through the public Agents API.
 *
 * Reads an export folder produced alongside `exports/<name>/manifest.json` and
 * POSTs each post to `POST /publications/:id/posts`, oldest first, passing the
 * original `slug` and `publishedAt` so URLs and dates survive the move.
 *
 * Everything goes through the public API, so no CMS credentials are involved —
 * the platform resolves the publication's own CMS token server-side.
 *
 * Safe to re-run: a post whose slug already exists comes back 409 and is
 * reported as "already there" rather than duplicated. Nothing is ever deleted.
 *
 * Usage (from the repo root):
 *   HM_API_KEY_FILE=.hm-api-key \
 *   pnpm tsx scripts/import-posts.ts \
 *     --export exports/looking-ahead \
 *     --publication 1edf85d1-37d4-43ab-a177-820f18bdd78c \
 *     --dry-run
 *
 * Drop --dry-run to write. `HM_API_KEY` works too, but a file keeps the key out
 * of your shell history.
 *
 * Flags:
 *   --export <dir>       Export folder containing manifest.json (required)
 *   --publication <id>   Target Hot Metal publication id (required)
 *   --api <base>         API base (default https://hotmetalapp.com/agents-api/v1)
 *   --dry-run            Report what would be sent; write nothing
 *   --status <s>         Override the status posted (default: the export's own)
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

// ─── Config ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const flag = (name: string): string | undefined => {
	const i = args.indexOf(`--${name}`)
	return i === -1 ? undefined : args[i + 1]
}

const EXPORT_DIR = flag('export')
const PUBLICATION_ID = flag('publication')
const API_BASE = flag('api') ?? 'https://hotmetalapp.com/agents-api/v1'
const DRY_RUN = args.includes('--dry-run')
const STATUS_OVERRIDE = flag('status')

const API_KEY = process.env.HM_API_KEY_FILE
	? readFileSync(process.env.HM_API_KEY_FILE, 'utf8').trim()
	: process.env.HM_API_KEY

const missing = [
	['--export', EXPORT_DIR],
	['--publication', PUBLICATION_ID],
	...(DRY_RUN ? [] : ([['HM_API_KEY or HM_API_KEY_FILE', API_KEY]] as const)),
].filter(([, v]) => !v)

if (missing.length > 0) {
	console.error(`✗ Missing: ${missing.map(([k]) => k).join(', ')}. See the script header.`)
	process.exit(2)
}

if (API_KEY && !API_KEY.startsWith('hm_')) {
	console.error('✗ The API key should start with "hm_". Check the file has the key and nothing else.')
	process.exit(2)
}

// ─── The API contract ──────────────────────────────────────────────────────

/**
 * Exactly the fields `POST /publications/:id/posts` accepts. The export carries
 * extra bookkeeping (`sourceId`, `contentHtml`, …) that must not be sent — the
 * API regenerates HTML from markdown, and unknown keys are simply ignored, but
 * sending them would obscure what actually crossed over.
 */
const API_FIELDS = [
	'title',
	'markdown',
	'slug',
	'status',
	'publishedAt',
	'author',
	'subtitle',
	'hook',
	'excerpt',
	'tags',
	'topics',
	'featuredImage',
	'seoTitle',
	'seoDescription',
	'canonicalUrl',
	'ogImage',
	'citations',
] as const

interface ManifestEntry {
	order: number
	file: string
	slug: string
	title: string
	publishedAt: string | null
	publishedAtSource: string
}

function buildBody(post: Record<string, unknown>): Record<string, unknown> {
	const body: Record<string, unknown> = {}
	for (const field of API_FIELDS) {
		const value = post[field]
		// null and '' are no-ops on the API; omit them so the payload says what it means.
		if (value === undefined || value === null || value === '') continue
		body[field] = value
	}
	if (STATUS_OVERRIDE) body.status = STATUS_OVERRIDE
	return body
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
	const manifestPath = resolve(EXPORT_DIR!, 'manifest.json')
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
		publication?: { name?: string; slug?: string }
		postCount: number
		posts: ManifestEntry[]
	}

	console.log(`Export:      ${manifestPath}`)
	console.log(`Source:      ${manifest.publication?.name ?? 'unknown'} (${manifest.posts.length} posts)`)
	console.log(`Target:      ${API_BASE}/publications/${PUBLICATION_ID}/posts`)
	console.log(`Mode:        ${DRY_RUN ? 'DRY RUN — nothing will be written' : 'LIVE'}\n`)

	let created = 0
	let already = 0
	const failures: Array<{ slug: string; status: number; detail: string }> = []

	for (const entry of manifest.posts) {
		const post = JSON.parse(readFileSync(resolve(dirname(manifestPath), entry.file), 'utf8')) as Record<string, unknown>
		const body = buildBody(post)
		const date = String(body.publishedAt ?? '').slice(0, 10)
		const label = `${String(entry.order).padStart(2, '0')}  ${date}  ${entry.slug}`

		if (DRY_RUN) {
			const fields = Object.keys(body).filter((k) => k !== 'markdown').join(', ')
			console.log(`  · ${label}`)
			console.log(`      ${String(body.markdown ?? '').length} chars of markdown; fields: ${fields}`)
			if (entry.publishedAtSource.includes('created_at')) {
				console.log(`      ⚠ date came from created_at — the source had no publishedAt`)
			}
			continue
		}

		const res = await fetch(`${API_BASE}/publications/${PUBLICATION_ID}/posts`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		})
		const payload = (await res.json().catch(() => ({}))) as { data?: { id?: string }; error?: string; code?: string }

		if (res.status === 201) {
			console.log(`  ✓ ${label}`)
			created++
		} else if (res.status === 409) {
			console.log(`  ⏭ ${label} (already there)`)
			already++
		} else {
			console.log(`  ✗ ${label} — ${res.status} ${payload.code ?? ''} ${payload.error ?? ''}`)
			failures.push({ slug: entry.slug, status: res.status, detail: `${payload.code ?? ''} ${payload.error ?? ''}`.trim() })
		}
	}

	if (DRY_RUN) {
		console.log(`\n✅ Dry run complete — ${manifest.posts.length} post(s) would be imported, nothing written.`)
		return
	}

	console.log(`\n${created} created, ${already} already present, ${failures.length} failed`)
	if (failures.length > 0) {
		console.error('\n✗ Failures:')
		for (const f of failures) console.error(`   ${f.slug}: ${f.status} ${f.detail}`)
		console.error('\nFix the cause and re-run — posts that landed are skipped on the next pass.')
		process.exit(1)
	}
	console.log('✅ Import complete.')
}

main().catch((err) => {
	console.error('✗ Import failed:', err)
	process.exit(1)
})
