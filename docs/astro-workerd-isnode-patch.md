# Astro SSR on Workers renders `[object Object]` — the `isNode` patch

**Status:** patched via `patches/astro@6.4.6.patch` (pnpm `patchedDependencies`).
**Affected app:** `apps/publications-web` (any Astro + `@astrojs/cloudflare` SSR app in this repo
that runs with the `nodejs_compat` compatibility flag).

## Symptom

Every server-rendered `.astro` **page** returns the literal 15-byte body `[object Object]`
with `content-type: text/html`, HTTP 200, and no `<!DOCTYPE html>`:

```
$ curl -i https://looking-ahead.hotmetalapp.com/
HTTP/2 200
content-type: text/html
content-length: 15
cache-control: public, s-maxage=3600, stale-while-revalidate=86400

[object Object]
```

Distinguishing detail: **`.ts` endpoints keep working.** `/rss`, `/atom`, `/robots.txt`
return correct content, because they build their own `Response`. Only routes that go
through Astro's page-render pipeline break — including the `404.astro` page, so unmatched
paths also return `[object Object]`.

The Worker reports `outcome: ok` with **no exceptions** in `wrangler tail`, so nothing
shows up as an error. The only signal is the response body.

## Root cause

Astro picks its response-body strategy from a runtime sniff
(`astro/dist/runtime/server/render/util.js`):

```js
const isNode = typeof process !== "undefined"
  && Object.prototype.toString.call(process) === "[object process]";
```

and in `renderPage()` (`astro/dist/runtime/server/render/page.js`):

```js
if (streaming) {
  if (isNode && !isDeno) {
    body = await renderToAsyncIterable(...);   // Node-only: returns a plain async iterable
  } else {
    body = await renderToReadableStream(...);  // web standard: returns a ReadableStream
  }
}
```

workerd's `nodejs_compat` `process` object carries `Symbol.toStringTag === "process"`, so
`Object.prototype.toString.call(process)` evaluates to `"[object process]"` **inside a
Cloudflare Worker**. Astro therefore believes it is running on Node and hands
`new Response(body)` a plain async-iterable object. Node's `Response` accepts that;
workerd's does not — it falls back to `String(body)`, i.e. `"[object Object]"`.

This is a runtime-side regression: the deployed bundle was untouched from 2026-06-24 to
2026-08-15, yet the site broke. Nothing in this repo changed; workerd's `process` shim did.

## The fix

`patches/astro@6.4.6.patch` narrows the sniff so workerd is never mistaken for Node:

```js
const isNode = typeof process !== "undefined"
  && Object.prototype.toString.call(process) === "[object process]"
  && !(typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers");
```

`navigator.userAgent === "Cloudflare-Workers"` is the documented workerd identifier and is
present for every compatibility date at or after 2022-03-21 (`global_navigator`).

With the patch, `renderPage()` takes the `renderToReadableStream` branch and pages render
normally.

## Maintenance

- The patch is pinned to the **exact** version `astro@6.4.6`. Bumping Astro will make pnpm
  fail to apply it — that is deliberate. On a bump, re-check whether upstream still has the
  unguarded `isNode` const; if it does, regenerate the patch:

  ```
  pnpm patch astro@<new-version>
  # edit dist/runtime/server/render/util.js in the printed directory
  pnpm patch-commit '<printed directory>'
  ```

- Astro 6.4.8 (latest at time of writing) still ships the unguarded check, so the patch is
  still required.

## Reproducing locally

`wrangler dev` on the **built** output reproduces it exactly (`astro dev` does not — Vite's
dev server does not go through the adapter's Worker entry).

```
cd apps/publications-web
pnpm build
# dist/server/wrangler.json is the effective (redirected) config; point CMS_URL at a stub
# and set "remote": true on the DAL service binding to reach prod data layer
npx wrangler dev
curl -s localhost:8787/ | head -c 80
```

A correct response starts with `<!DOCTYPE html>`. `[object Object]` means the patch is not
applied to the build.

## Post-deploy smoke check

This outage was invisible for weeks because feeds, `robots.txt` and the Worker's own
metrics all looked healthy. After any `publications-web` deploy, assert real HTML:

```
curl -s https://<slug>.hotmetalapp.com/ | head -c 15   # must be "<!DOCTYPE html>"
```

## Not affected

- EmDash fleet tenants (`super-emdash.hotmetalapp.com` and friends) — served by
  `@emdash-cms/cloudflare/worker` through the dispatch namespace, not by this render path.
- `apps/web` — a Vite/React SPA, no Astro SSR.
- `apps/docs` — static output.
- `apps/blog-frontend` — same Astro + `nodejs_compat` shape and therefore vulnerable, but
  it has no deployed Worker.
