/**
 * Writer Web — backend Worker
 *
 * Only receives requests for paths listed in `run_worker_first` in wrangler.jsonc
 * (/api/*, /agents/*, /health). All other requests (SPA routes, static assets)
 * are handled by the Cloudflare asset pipeline automatically.
 *
 * Proxies API & WebSocket requests to writer-agent, and scout trigger
 * requests directly to content-scout.
 */

/** Match `/api/publications/:id/scout` */
const SCOUT_TRIGGER_RE = /^\/api\/publications\/([^/]+)\/scout$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket proxy — forward agent connections to writer-agent
    if (url.pathname.startsWith('/agents/') && request.headers.get('Upgrade') === 'websocket') {
      return proxyWebSocket(url, env);
    }

    // HTTP proxy for agent endpoints (e.g. get-messages for initial message fetch)
    if (url.pathname.startsWith('/agents/')) {
      return proxyToWriterAgent(url, request, env);
    }

    // Scout trigger — proxy directly to content-scout service
    const scoutMatch = SCOUT_TRIGGER_RE.exec(url.pathname);
    if (scoutMatch && request.method === 'POST') {
      return proxyScoutTrigger(scoutMatch[1], env);
    }

    // HTTP API proxy — forward REST calls to writer-agent
    if (url.pathname.startsWith('/api/')) {
      return proxyToWriterAgent(url, request, env);
    }

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'writer-web' });
    }

    // Unmatched Worker route — return 404.
    // Static assets & SPA fallback are handled automatically by the asset
    // pipeline via `not_found_handling: "single-page-application"` in wrangler.jsonc.
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

/** Proxy an HTTP request to the writer-agent service. */
async function proxyToWriterAgent(url: URL, request: Request, env: Env): Promise<Response> {
  const target = `${env.WRITER_AGENT_URL}${url.pathname}${url.search}`;
  const headers = new Headers(request.headers);
  headers.set('X-API-Key', env.WRITER_API_KEY);

  const res = await fetch(target, {
    method: request.method,
    headers,
    body: request.body,
  });

  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
  });
}

/** Proxy a scout trigger request directly to the content-scout service. */
async function proxyScoutTrigger(publicationId: string, env: Env): Promise<Response> {
  if (!env.CONTENT_SCOUT_URL || !env.SCOUT_API_KEY) {
    return Response.json({ error: 'Scout service not configured' }, { status: 503 });
  }

  const res = await fetch(`${env.CONTENT_SCOUT_URL}/api/scout/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.SCOUT_API_KEY}`,
    },
    body: JSON.stringify({ publicationId }),
  });

  if (!res.ok) {
    console.error(`Scout service error (${res.status}):`, await res.text());
    return Response.json(
      { error: 'Content scout failed. Please try again later.' },
      { status: 502 },
    );
  }

  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
  });
}

/**
 * Proxy a WebSocket upgrade to the writer-agent service.
 *
 * Creates a WebSocketPair for the client, connects to the upstream agent,
 * and pipes messages bidirectionally.
 */
async function proxyWebSocket(url: URL, env: Env): Promise<Response> {
  const target = `${env.WRITER_AGENT_URL}${url.pathname}${url.search}`;

  const upstreamResp = await fetch(target, {
    headers: {
      Upgrade: 'websocket',
      'X-API-Key': env.WRITER_API_KEY,
    },
  });

  const upstream = upstreamResp.webSocket;
  if (!upstream) {
    return new Response('Failed to connect to agent', { status: 502 });
  }

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  server.accept();
  upstream.accept();

  // Pipe messages bidirectionally
  server.addEventListener('message', (event) => {
    try {
      upstream.send(event.data as string | ArrayBuffer);
    } catch {
      // upstream closed
    }
  });
  upstream.addEventListener('message', (event) => {
    try {
      server.send(event.data as string | ArrayBuffer);
    } catch {
      // client closed
    }
  });

  server.addEventListener('close', (event) => {
    try { upstream.close(event.code, event.reason); } catch { /* already closed */ }
  });
  upstream.addEventListener('close', (event) => {
    try { server.close(event.code, event.reason); } catch { /* already closed */ }
  });

  // Clean up on error
  server.addEventListener('error', () => {
    try { upstream.close(1011, 'Client error'); } catch { /* already closed */ }
  });
  upstream.addEventListener('error', () => {
    try { server.close(1011, 'Upstream error'); } catch { /* already closed */ }
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}
