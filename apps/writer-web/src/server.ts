/**
 * Writer Web — backend Worker
 *
 * Data reads (GET) are served directly via the DAL service binding,
 * avoiding a hop through writer-agent. Writes, AI operations, and
 * WebSocket connections are still proxied to writer-agent.
 *
 * Scout trigger requests go directly to content-scout.
 */

import type { DataLayerApi } from '@hotmetal/data-layer'

type IdeaStatus = 'new' | 'reviewed' | 'promoted' | 'dismissed'
const IDEA_STATUSES: readonly IdeaStatus[] = ['new', 'reviewed', 'promoted', 'dismissed']

/** Match `/api/publications/:id/scout` */
const SCOUT_TRIGGER_RE = /^\/api\/publications\/([^/]+)\/scout$/

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // WebSocket proxy — forward agent connections to writer-agent
    if (url.pathname.startsWith('/agents/') && request.headers.get('Upgrade') === 'websocket') {
      return proxyWebSocket(url, env)
    }

    // HTTP proxy for agent endpoints (e.g. get-messages for initial message fetch)
    if (url.pathname.startsWith('/agents/')) {
      return proxyToWriterAgent(url, request, env)
    }

    // Scout trigger — proxy directly to content-scout service
    const scoutMatch = SCOUT_TRIGGER_RE.exec(url.pathname)
    if (scoutMatch && request.method === 'POST') {
      return proxyScoutTrigger(scoutMatch[1], env)
    }

    // Data reads — serve directly from DAL
    if (request.method === 'GET' && url.pathname.startsWith('/api/')) {
      const dalResponse = await handleDataRead(url, env.DAL)
      if (dalResponse) return dalResponse
    }

    // Everything else (writes, AI, DO access) — proxy to writer-agent
    if (url.pathname.startsWith('/api/')) {
      return proxyToWriterAgent(url, request, env)
    }

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'writer-web' })
    }

    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>

// ─── DAL direct reads ───────────────────────────────────────────────

/** Handle GET requests for known data-read patterns directly via DAL. Returns null if not matched. */
async function handleDataRead(url: URL, dal: DataLayerApi): Promise<Response | null> {
  const path = url.pathname
  let match: RegExpExecArray | null

  // GET /api/sessions
  if (path === '/api/sessions') {
    const userId = url.searchParams.get('userId') || undefined
    const status = url.searchParams.get('status') || undefined
    const result = await dal.listSessions({ userId, status: status as 'active' | 'completed' | 'archived' | undefined })
    return Response.json({ data: result })
  }

  // GET /api/sessions/:id (but not /api/sessions/:id/drafts or other sub-paths)
  match = /^\/api\/sessions\/([^/]+)$/.exec(path)
  if (match) {
    const session = await dal.getSessionById(match[1])
    if (!session) return Response.json({ error: 'Session not found' }, { status: 404 })
    return Response.json(session)
  }

  // GET /api/publications
  if (path === '/api/publications') {
    const userId = url.searchParams.get('userId')
    const result = userId
      ? await dal.listPublicationsByUser(userId)
      : await dal.listAllPublications()
    return Response.json({ data: result })
  }

  // GET /api/publications/:id
  match = /^\/api\/publications\/([^/]+)$/.exec(path)
  if (match) {
    const publication = await dal.getPublicationById(match[1])
    if (!publication) return Response.json({ error: 'Publication not found' }, { status: 404 })
    const topics = await dal.listTopicsByPublication(publication.id)
    return Response.json({ ...publication, topics })
  }

  // GET /api/publications/:pubId/topics
  match = /^\/api\/publications\/([^/]+)\/topics$/.exec(path)
  if (match) {
    const result = await dal.listTopicsByPublication(match[1])
    return Response.json({ data: result })
  }

  // GET /api/publications/:pubId/ideas/count
  match = /^\/api\/publications\/([^/]+)\/ideas\/count$/.exec(path)
  if (match) {
    const count = await dal.countIdeasByPublication(match[1])
    return Response.json({ count })
  }

  // GET /api/publications/:pubId/ideas
  match = /^\/api\/publications\/([^/]+)\/ideas$/.exec(path)
  if (match) {
    const statusParam = url.searchParams.get('status')
    if (statusParam && !IDEA_STATUSES.includes(statusParam as IdeaStatus)) {
      return Response.json({ error: `Invalid status. Must be one of: ${IDEA_STATUSES.join(', ')}` }, { status: 400 })
    }
    const result = await dal.listIdeasByPublication(match[1], {
      status: statusParam as IdeaStatus | undefined,
    })
    return Response.json({ data: result })
  }

  // GET /api/ideas/new-count
  if (path === '/api/ideas/new-count') {
    const count = await dal.countIdeasByStatus('new')
    return Response.json({ count })
  }

  // GET /api/ideas/:id
  match = /^\/api\/ideas\/([^/]+)$/.exec(path)
  if (match) {
    const idea = await dal.getIdeaById(match[1])
    if (!idea) return Response.json({ error: 'Idea not found' }, { status: 404 })
    return Response.json(idea)
  }

  // GET /api/activity
  if (path === '/api/activity') {
    const days = Math.max(1, Math.min(Number(url.searchParams.get('days')) || 30, 90))
    const activities = await dal.getRecentActivity(days)
    return Response.json({ data: activities })
  }

  // Not a known read pattern — fall through to proxy
  return null
}

// ─── Writer-agent proxy (writes, AI, DO) ────────────────────────────

async function proxyToWriterAgent(url: URL, request: Request, env: Env): Promise<Response> {
  const target = `${env.WRITER_AGENT_URL}${url.pathname}${url.search}`
  const headers = new Headers(request.headers)
  headers.set('X-API-Key', env.WRITER_API_KEY)

  const res = await fetch(target, {
    method: request.method,
    headers,
    body: request.body,
  })

  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
  })
}

// ─── Content-scout proxy ────────────────────────────────────────────

async function proxyScoutTrigger(publicationId: string, env: Env): Promise<Response> {
  if (!env.CONTENT_SCOUT_URL || !env.SCOUT_API_KEY) {
    return Response.json({ error: 'Scout service not configured' }, { status: 503 })
  }

  const res = await fetch(`${env.CONTENT_SCOUT_URL}/api/scout/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.SCOUT_API_KEY}`,
    },
    body: JSON.stringify({ publicationId }),
  })

  if (!res.ok) {
    console.error(`Scout service error (${res.status}):`, await res.text())
    return Response.json(
      { error: 'Content scout failed. Please try again later.' },
      { status: 502 },
    )
  }

  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
  })
}

// ─── WebSocket proxy ────────────────────────────────────────────────

async function proxyWebSocket(url: URL, env: Env): Promise<Response> {
  const target = `${env.WRITER_AGENT_URL}${url.pathname}${url.search}`

  const upstreamResp = await fetch(target, {
    headers: {
      Upgrade: 'websocket',
      'X-API-Key': env.WRITER_API_KEY,
    },
  })

  const upstream = upstreamResp.webSocket
  if (!upstream) {
    return new Response('Failed to connect to agent', { status: 502 })
  }

  const pair = new WebSocketPair()
  const [client, server] = Object.values(pair)

  server.accept()
  upstream.accept()

  // Pipe messages bidirectionally
  server.addEventListener('message', (event) => {
    try {
      upstream.send(event.data as string | ArrayBuffer)
    } catch {
      // upstream closed
    }
  })
  upstream.addEventListener('message', (event) => {
    try {
      server.send(event.data as string | ArrayBuffer)
    } catch {
      // client closed
    }
  })

  server.addEventListener('close', (event) => {
    try { upstream.close(event.code, event.reason) } catch { /* already closed */ }
  })
  upstream.addEventListener('close', (event) => {
    try { server.close(event.code, event.reason) } catch { /* already closed */ }
  })

  server.addEventListener('error', () => {
    try { upstream.close(1011, 'Client error') } catch { /* already closed */ }
  })
  upstream.addEventListener('error', () => {
    try { server.close(1011, 'Upstream error') } catch { /* already closed */ }
  })

  return new Response(null, {
    status: 101,
    webSocket: client,
  })
}
