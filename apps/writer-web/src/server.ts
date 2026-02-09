/**
 * Writer Web — backend Worker
 *
 * This is a thin server that serves the Vite-built React SPA and proxies
 * API requests to the writer-agent service. It also proxies WebSocket
 * connections for the Agents SDK streaming protocol.
 */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket proxy — forward agent connections to writer-agent
    if (url.pathname.startsWith('/agents/') && request.headers.get('Upgrade') === 'websocket') {
      return proxyWebSocket(url, env);
    }

    // HTTP proxy for agent endpoints (e.g. get-messages for initial message fetch)
    if (url.pathname.startsWith('/agents/')) {
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

    // HTTP API proxy — forward REST calls to writer-agent
    if (url.pathname.startsWith('/api/')) {
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

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'writer-web' });
    }

    // Everything else — serve static assets or SPA fallback (index.html)
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

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
