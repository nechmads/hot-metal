#!/usr/bin/env npx tsx
/**
 * Integration test for the Agents API (/agents-api/v1/*).
 *
 * Creates a temporary API key in the local D1 database, exercises every
 * endpoint an AI agent would use, then cleans up.
 *
 * Usage:
 *   1. Start the dev server:  pnpm --filter @hotmetal/web dev:stack
 *   2. Run the test:          npx tsx scripts/test-agents-api.ts
 *
 * The script will exit with code 0 on success, 1 on failure.
 */

import { createHash, randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.API_URL || 'http://localhost:5174/agents-api/v1'
const DB_PATH = resolve(
	__dirname,
	'../.wrangler/shared-state/v3/d1/miniflare-D1DatabaseObject/e4ddd9266b79d41237e75870819a1373488b8a70f39de91eafd1b85888b4a8e2.sqlite',
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
let skipped = 0
const failures: string[] = []

function sha256(input: string): string {
	return createHash('sha256').update(input).digest('hex')
}

async function api(
	method: string,
	path: string,
	token: string,
	body?: unknown,
): Promise<{ status: number; data: unknown }> {
	const url = `${BASE_URL}${path}`
	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
	}
	if (body !== undefined) {
		headers['Content-Type'] = 'application/json'
	}
	const res = await fetch(url, {
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	})
	const data = await res.json().catch(() => null)
	return { status: res.status, data }
}

function assert(
	testName: string,
	condition: boolean,
	detail?: string,
): void {
	if (condition) {
		console.log(`  ✓ ${testName}`)
		passed++
	} else {
		const msg = detail ? `${testName} — ${detail}` : testName
		console.log(`  ✗ ${msg}`)
		failed++
		failures.push(msg)
	}
}

function skip(testName: string, reason: string): void {
	console.log(`  ⊘ ${testName} — ${reason}`)
	skipped++
}

// ─── Setup: create a temp API key directly in the local D1 ───────────────────

function setupApiKey(): { token: string; userId: string; keyId: string } {
	const db = new Database(DB_PATH)

	// Pick the first user that has publications
	const user = db
		.prepare(
			`SELECT u.id FROM users u
			 JOIN publications p ON p.user_id = u.id
			 GROUP BY u.id
			 ORDER BY COUNT(p.id) DESC
			 LIMIT 1`,
		)
		.get() as { id: string } | undefined

	if (!user) {
		console.error('No user with publications found in local DB. Run dev:stack first.')
		process.exit(1)
	}

	const keyId = randomUUID()
	const rawToken = `hm_${randomUUID().replace(/-/g, '')}`
	const tokenHash = sha256(rawToken)
	const lastFour = rawToken.slice(-4)
	const now = Math.floor(Date.now() / 1000)

	db.prepare(
		`INSERT INTO user_api_keys (id, user_id, token_hash, label, last_four, is_active, created_at)
		 VALUES (?, ?, ?, ?, ?, 1, ?)`,
	).run(keyId, user.id, tokenHash, '__test_agents_api__', lastFour, now)

	db.close()

	console.log(`Created test API key for user ${user.id} (last 4: ...${lastFour})\n`)
	return { token: rawToken, userId: user.id, keyId }
}

function cleanupApiKey(keyId: string): void {
	const db = new Database(DB_PATH)
	db.prepare('DELETE FROM user_api_keys WHERE id = ?').run(keyId)
	db.close()
}

// ─── Test suites ─────────────────────────────────────────────────────────────

async function testAuth(token: string) {
	console.log('── Auth ──')

	// Valid key
	const ok = await api('GET', '/me', token)
	assert('GET /me returns 200', ok.status === 200)
	const me = (ok.data as any)?.data
	assert('GET /me returns user data', !!me?.id && !!me?.email && !!me?.tier)

	// Invalid key
	const bad = await api('GET', '/me', 'hm_invalidtoken')
	assert('Invalid key returns 401', bad.status === 401)

	// No key
	const none = await fetch(`${BASE_URL}/me`)
	assert('Missing key returns 401', none.status === 401)
}

async function testPublications(token: string) {
	console.log('\n── Publications ──')

	// List
	const list = await api('GET', '/publications', token)
	assert('GET /publications returns 200', list.status === 200)
	const pubs = (list.data as any)?.data
	assert('Publications list is an array', Array.isArray(pubs))
	assert('At least one publication exists', pubs?.length > 0, `got ${pubs?.length}`)

	if (!pubs?.length) return { pubId: null, createdPubId: null }

	// Get single
	const pubId = pubs[0].id
	const single = await api('GET', `/publications/${pubId}`, token)
	assert('GET /publications/:id returns 200', single.status === 200)
	const pub = (single.data as any)?.data
	assert('Single publication has topics array', Array.isArray(pub?.topics))

	// Get non-existent
	const notFound = await api('GET', '/publications/nonexistent-id', token)
	assert('Non-existent publication returns 404', notFound.status === 404)

	// Create — may hit quota (tier limit on publications), which is fine
	const slug = `test-api-${Date.now()}`
	const create = await api('POST', '/publications', token, {
		name: 'Test API Publication',
		slug,
		description: 'Created by test-agents-api.ts',
	})
	let createdPubId: string | null = null
	if (create.status === 201) {
		assert('POST /publications returns 201', true)
		createdPubId = (create.data as any)?.data?.id
		assert('Created publication has id', !!createdPubId)
	} else if (create.status === 403) {
		assert('POST /publications returns quota error when at limit', true)
		const errorData = create.data as any
		assert('Quota error includes limit info', !!errorData?.limit && !!errorData?.current)
		skip('Created publication has id', 'quota exceeded')
	} else {
		assert('POST /publications returns 201 or 403', false, `got ${create.status}`)
	}

	// Create with bad slug — if we're already at quota, we'll get 403 (quota check runs first)
	const badSlug = await api('POST', '/publications', token, {
		name: 'Bad',
		slug: 'INVALID SLUG!',
	})
	if (createdPubId !== null) {
		// Not at quota, so validation should run
		assert('Bad slug returns 400', badSlug.status === 400)
	} else {
		// At quota, so 403 is expected
		assert('Bad slug returns 400 or 403 (quota)', badSlug.status === 400 || badSlug.status === 403)
	}

	// Update (use existing publication if creation was blocked by quota)
	const updatePubId = createdPubId || pubId
	const update = await api('PATCH', `/publications/${updatePubId}`, token, {
		description: 'Updated by test',
	})
	assert('PATCH /publications/:id returns 200', update.status === 200)
	const updated = (update.data as any)?.data
	assert('Description was updated', updated?.description === 'Updated by test')

	// Restore original description
	await api('PATCH', `/publications/${updatePubId}`, token, {
		description: null,
	})

	// Get posts — requires CMS connectivity, may fail in local dev
	const posts = await api('GET', `/publications/${pubId}/posts`, token)
	if (posts.status === 200) {
		assert('GET /publications/:id/posts returns 200', true)
		assert('Posts data is an array', Array.isArray((posts.data as any)?.data))
	} else if (posts.status === 500) {
		skip('GET /publications/:id/posts', 'CMS not reachable in local dev (500)')
	} else {
		assert('GET /publications/:id/posts returns 200', false, `got ${posts.status}`)
	}

	return { pubId, createdPubId }
}

async function testTopics(token: string, pubId: string) {
	console.log('\n── Topics ──')

	// List
	const list = await api('GET', `/publications/${pubId}/topics`, token)
	assert('GET topics returns 200', list.status === 200)
	assert('Topics is an array', Array.isArray((list.data as any)?.data))

	// Create — may hit quota (3 topics per pub on free tier)
	const create = await api('POST', `/publications/${pubId}/topics`, token, {
		name: 'Test Topic from API',
		description: 'Created by test script',
		priority: 2,
	})
	let topicId: string | null = null
	if (create.status === 201) {
		assert('POST topic returns 201', true)
		topicId = (create.data as any)?.data?.id
		assert('Created topic has id', !!topicId)
	} else if (create.status === 403) {
		assert('POST topic returns quota error when at limit', true)
		skip('Created topic has id', 'quota exceeded')
	} else {
		assert('POST topic returns 201 or 403', false, `got ${create.status}`)
	}

	// Create with missing name — if at quota, 403 comes first
	const noName = await api('POST', `/publications/${pubId}/topics`, token, {
		description: 'No name',
	})
	assert(
		'Topic without name returns 400 or 403',
		noName.status === 400 || noName.status === 403,
		`got ${noName.status}`,
	)

	// Create with bad priority — if at quota, 403 comes first
	const badPriority = await api('POST', `/publications/${pubId}/topics`, token, {
		name: 'Bad',
		priority: 99,
	})
	assert(
		'Topic with bad priority returns 400 or 403',
		badPriority.status === 400 || badPriority.status === 403,
		`got ${badPriority.status}`,
	)

	// Update & Delete (only if we created a topic)
	if (topicId) {
		const update = await api('PATCH', `/topics/${topicId}`, token, {
			name: 'Updated Topic Name',
		})
		assert('PATCH topic returns 200', update.status === 200)
		assert(
			'Topic name was updated',
			(update.data as any)?.data?.name === 'Updated Topic Name',
		)

		// Delete
		const del = await api('DELETE', `/topics/${topicId}`, token)
		assert('DELETE topic returns 200', del.status === 200)
		assert('Delete response has deleted: true', (del.data as any)?.data?.deleted === true)
	} else {
		skip('PATCH topic', 'no topic created')
		skip('DELETE topic', 'no topic created')
	}
}

/**
 * Read a post back through the LIST endpoint.
 *
 * Deliberately not the single-post read: on EmDash that route hydrates the
 * pending draft revision over its response, so it reports edits that have not
 * reached the columns the blog actually renders. The list endpoint serves the
 * columns, so it is the only honest check that an edit went live.
 */
async function findPostInList(token: string, pubId: string, slug: string): Promise<any | undefined> {
	const res = await api('GET', `/publications/${pubId}/posts?limit=100`, token)
	const posts = (res.data as any)?.data
	return Array.isArray(posts) ? posts.find((p: any) => p.slug === slug) : undefined
}

async function testPosts(token: string, pubId: string) {
	console.log('\n── Posts (authored) ──')

	// Unique per run: there is no delete-post endpoint, so created posts persist
	// in the local CMS and a fixed slug would 409 on the second run.
	const slug = `api-test-post-${Date.now()}`
	const publishedAt = '2026-02-14T09:00:00.000Z'

	const create = await api('POST', `/publications/${pubId}/posts`, token, {
		title: 'Authored Post from API',
		markdown: '## Heading\n\nBody text written by the caller.',
		slug,
		publishedAt,
		excerpt: 'Created by the test script.',
	})
	assert('POST post returns 201', create.status === 201, `got ${create.status}`)
	const postId = (create.data as any)?.data?.id
	assert('Created post has id', !!postId)
	assert('Created post keeps the supplied slug', (create.data as any)?.data?.slug === slug)

	// Same slug twice must not silently create a second post.
	const duplicate = await api('POST', `/publications/${pubId}/posts`, token, {
		title: 'Authored Post from API',
		markdown: 'Body.',
		slug,
	})
	assert('POST duplicate slug returns 409', duplicate.status === 409, `got ${duplicate.status}`)

	// Validation
	const noMarkdown = await api('POST', `/publications/${pubId}/posts`, token, {
		title: 'Missing body',
	})
	assert('POST without markdown returns 400', noMarkdown.status === 400, `got ${noMarkdown.status}`)

	const badSlug = await api('POST', `/publications/${pubId}/posts`, token, {
		title: 'Bad slug',
		markdown: 'Body.',
		slug: 'Not A Slug',
	})
	assert('POST with malformed slug returns 400', badSlug.status === 400, `got ${badSlug.status}`)

	const badDate = await api('POST', `/publications/${pubId}/posts`, token, {
		title: 'Bad date',
		markdown: 'Body.',
		publishedAt: 'last tuesday',
	})
	assert('POST with unparseable publishedAt returns 400', badDate.status === 400, `got ${badDate.status}`)

	const badStatus = await api('POST', `/publications/${pubId}/posts`, token, {
		title: 'Bad status',
		markdown: 'Body.',
		status: 'archived',
	})
	assert('POST with unsupported status returns 400', badStatus.status === 400, `got ${badStatus.status}`)

	if (postId) {
		const update = await api('PATCH', `/publications/${pubId}/posts/${postId}`, token, {
			title: 'Authored Post from API (edited)',
			markdown: '## Heading\n\nEdited body.',
		})
		assert('PATCH post returns 200', update.status === 200, `got ${update.status}`)
		assert(
			'Post title was updated',
			(update.data as any)?.data?.title === 'Authored Post from API (edited)',
		)

		const empty = await api('PATCH', `/publications/${pubId}/posts/${postId}`, token, {})
		assert('PATCH with no fields returns 400', empty.status === 400, `got ${empty.status}`)

		// Regression guard for the EmDash revision model: a PUT stages a draft
		// revision and only a publish promotes it into the columns the blog reads.
		// The single-entry GET hydrates the draft over its response, so the PATCH
		// body looks correct either way — these assertions MUST read back through
		// the list endpoint, which serves the columns.
		const retitled = 'Authored Post from API (retitled with date)'
		const withDate = await api('PATCH', `/publications/${pubId}/posts/${postId}`, token, {
			title: retitled,
			publishedAt: '2026-03-01T12:00:00.000Z',
		})
		assert('PATCH title + publishedAt returns 200', withDate.status === 200, `got ${withDate.status}`)
		assert(
			'Field edit lands in the published columns, not just a draft revision',
			(await findPostInList(token, pubId, slug))?.title === retitled,
			`list shows ${JSON.stringify((await findPostInList(token, pubId, slug))?.title)}`,
		)
	} else {
		skip('PATCH post', 'no post created')
		skip('PATCH with no fields', 'no post created')
	}

	if (postId) {
		// Regression guard for the other revert path: unpublish forks a draft
		// revision from the last published snapshot, so a later publish must not be
		// allowed to replay it over the fields the same request writes.
		const toDraft = await api('PATCH', `/publications/${pubId}/posts/${postId}`, token, { status: 'draft' })
		assert('PATCH to draft returns 200', toDraft.status === 200, `got ${toDraft.status}`)

		const republished = 'Authored Post from API (republished)'
		const back = await api('PATCH', `/publications/${pubId}/posts/${postId}`, token, {
			title: republished,
			status: 'published',
		})
		assert('PATCH back to published returns 200', back.status === 200, `got ${back.status}`)
		assert(
			'Field edit survives a draft → published round-trip',
			(await findPostInList(token, pubId, slug))?.title === republished,
			`list shows ${JSON.stringify((await findPostInList(token, pubId, slug))?.title)}`,
		)
	}

	const missing = await api('PATCH', `/publications/${pubId}/posts/does-not-exist`, token, {
		title: 'Nope',
	})
	assert('PATCH unknown post returns 404', missing.status === 404, `got ${missing.status}`)

	const paged = await api('GET', `/publications/${pubId}/posts?limit=1&offset=0`, token)
	assert('GET posts honours limit', paged.status === 200 && ((paged.data as any)?.data?.length ?? 0) <= 1)
	const badLimit = await api('GET', `/publications/${pubId}/posts?limit=500`, token)
	assert('GET posts rejects limit above 100', badLimit.status === 400, `got ${badLimit.status}`)
}

async function testIdeas(token: string, pubId: string) {
	console.log('\n── Ideas ──')

	// List all
	const list = await api('GET', `/publications/${pubId}/ideas`, token)
	assert('GET ideas returns 200', list.status === 200)
	const ideas = (list.data as any)?.data
	assert('Ideas is an array', Array.isArray(ideas))

	// List with status filter
	const filtered = await api('GET', `/publications/${pubId}/ideas?status=new`, token)
	assert('GET ideas with ?status=new returns 200', filtered.status === 200)

	// Invalid status filter
	const badFilter = await api(
		'GET',
		`/publications/${pubId}/ideas?status=invalid`,
		token,
	)
	assert('Invalid status filter returns 400', badFilter.status === 400)

	// Get single idea (if any exist)
	if (ideas?.length > 0) {
		const ideaId = ideas[0].id
		const single = await api('GET', `/ideas/${ideaId}`, token)
		assert('GET /ideas/:id returns 200', single.status === 200)
		assert('Idea has data', !!(single.data as any)?.data?.id)
	}
}

async function testStyles(token: string) {
	console.log('\n── Styles ──')

	const list = await api('GET', '/styles', token)
	assert('GET /styles returns 200', list.status === 200)
	const styles = (list.data as any)?.data
	assert('Styles is an array', Array.isArray(styles))
	assert('At least prebuilt styles exist', styles?.length > 0, `got ${styles?.length}`)
}

async function testSessions(token: string) {
	console.log('\n── Sessions ──')

	// Non-existent session
	const notFound = await api('GET', '/sessions/nonexistent-id', token)
	assert('Non-existent session returns 404', notFound.status === 404)
}

async function testDraftGeneration(token: string, pubId: string) {
	console.log('\n── Draft Generation ──')

	// Missing required fields
	const noTitle = await api('POST', `/publications/${pubId}/drafts/generate`, token, {
		instructions: 'Write something',
	})
	assert('Missing title returns 400', noTitle.status === 400)

	const noInstructions = await api(
		'POST',
		`/publications/${pubId}/drafts/generate`,
		token,
		{ title: 'Test' },
	)
	assert('Missing instructions returns 400', noInstructions.status === 400)

	// Invalid webhook URL
	const badWebhook = await api(
		'POST',
		`/publications/${pubId}/drafts/generate`,
		token,
		{
			title: 'Test',
			instructions: 'Write a test',
			webhookUrl: 'http://localhost:3000/hook',
		},
	)
	assert(
		'Non-HTTPS webhook URL returns 400',
		badWebhook.status === 400,
		`got ${badWebhook.status}: ${JSON.stringify(badWebhook.data)}`,
	)

	// SSRF: private IP
	const ssrf = await api(
		'POST',
		`/publications/${pubId}/drafts/generate`,
		token,
		{
			title: 'Test',
			instructions: 'Write a test',
			webhookUrl: 'https://10.0.0.1/hook',
		},
	)
	assert(
		'Private IP webhook URL returns 400',
		ssrf.status === 400,
		`got ${ssrf.status}: ${JSON.stringify(ssrf.data)}`,
	)

	// NOTE: We don't test actual draft generation here as it requires
	// the WriterAgent DO + Anthropic API key, which may not be available.
	console.log('  ℹ Skipping actual generation (requires WriterAgent DO + LLM)')
}

async function testPublish(token: string) {
	console.log('\n── Publish ──')

	// Non-existent session
	const notFound = await api('POST', '/sessions/nonexistent-id/publish', token, {
		slug: 'test',
		author: 'Test',
	})
	assert('Publish non-existent session returns 404', notFound.status === 404)

	// Tweet length validation — session check comes first, so 404 expected
	const longTweet = await api('POST', '/sessions/nonexistent-id/publish', token, {
		slug: 'test',
		tweetText: 'x'.repeat(257),
	})
	assert(
		'Publish validates session before tweet length',
		longTweet.status === 404,
	)
}

async function testScout(token: string, pubId: string) {
	console.log('\n── Scout ──')

	// Non-existent publication
	const notFound = await api('POST', '/publications/nonexistent-id/scout/run', token, {})
	assert('Scout non-existent pub returns 404', notFound.status === 404)

	// Bad webhook URL
	const badHook = await api('POST', `/publications/${pubId}/scout/run`, token, {
		webhookUrl: 'http://evil.com/hook',
	})
	assert(
		'Scout with non-HTTPS webhook returns 400',
		badHook.status === 400,
		`got ${badHook.status}: ${JSON.stringify(badHook.data)}`,
	)

	// Valid request (will return 503 if content-scout not running, that's fine)
	const run = await api('POST', `/publications/${pubId}/scout/run`, token, {})
	assert(
		'Scout run returns 200 or 503',
		run.status === 200 || run.status === 503,
		`got ${run.status}`,
	)
	if (run.status === 200) {
		assert('Scout returns queued: true', (run.data as any)?.data?.queued === true)
	} else {
		console.log('  ℹ Scout service not running (503) — expected in local dev without full stack')
	}
}

async function testCORS(token: string) {
	console.log('\n── CORS ──')

	// Check CORS headers on actual request with Origin header
	const res = await fetch(`${BASE_URL}/me`, {
		headers: {
			Authorization: `Bearer ${token}`,
			Origin: 'https://external-agent.example.com',
		},
	})
	const allowOrigin = res.headers.get('access-control-allow-origin')
	assert('CORS allows any origin', allowOrigin === '*', `got ${allowOrigin}`)

	// OPTIONS preflight request
	const preflight = await fetch(`${BASE_URL}/me`, {
		method: 'OPTIONS',
		headers: {
			Origin: 'https://external-agent.example.com',
			'Access-Control-Request-Method': 'GET',
			'Access-Control-Request-Headers': 'Authorization',
		},
	})
	assert('Preflight returns 204', preflight.status === 204, `got ${preflight.status}`)
	const allowMethods = preflight.headers.get('access-control-allow-methods')
	assert('Preflight allows methods', !!allowMethods, `got ${allowMethods}`)
}

// ─── Cleanup helper ──────────────────────────────────────────────────────────

function cleanupTestData(pubId: string | null) {
	if (!pubId) return
	const db = new Database(DB_PATH)
	// Delete test publication and its topics
	db.prepare('DELETE FROM topics WHERE publication_id = ?').run(pubId)
	db.prepare('DELETE FROM publications WHERE id = ?').run(pubId)
	db.close()
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
	console.log('═══════════════════════════════════════════')
	console.log('  Agents API Integration Test')
	console.log(`  Target: ${BASE_URL}`)
	console.log('═══════════════════════════════════════════\n')

	// Check server is running
	try {
		const health = await fetch(BASE_URL.replace('/agents-api/v1', '/health'))
		if (!health.ok) throw new Error(`Health check returned ${health.status}`)
	} catch (err) {
		console.error(
			'Dev server is not running. Start it with:\n  pnpm --filter @hotmetal/web dev:stack\n',
		)
		process.exit(1)
	}

	const { token, keyId } = setupApiKey()
	let createdPubId: string | null = null

	try {
		await testAuth(token)

		const { pubId, createdPubId: newPubId } = await testPublications(token)
		createdPubId = newPubId ?? null

		if (pubId) {
			await testTopics(token, pubId)
			await testPosts(token, pubId)
			await testIdeas(token, pubId)
			await testDraftGeneration(token, pubId)
			await testScout(token, pubId)
		}

		await testStyles(token)
		await testSessions(token)
		await testPublish(token)
		await testCORS(token)
	} finally {
		// Cleanup
		console.log('\n── Cleanup ──')
		cleanupApiKey(keyId)
		console.log('  ✓ Removed test API key')

		if (createdPubId) {
			cleanupTestData(createdPubId)
			console.log('  ✓ Removed test publication')
		}
	}

	// Summary
	console.log('\n═══════════════════════════════════════════')
	console.log(`  Results: ${passed} passed, ${failed} failed, ${skipped} skipped`)
	if (failures.length > 0) {
		console.log('\n  Failures:')
		for (const f of failures) {
			console.log(`    • ${f}`)
		}
	}
	console.log('═══════════════════════════════════════════\n')

	process.exit(failed > 0 ? 1 : 0)
}

main()
