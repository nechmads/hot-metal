# Dependency baseline and upgrades

Last updated: 2026-10-29.

## October 2026 baseline

The upgrade targets the npm versions available on October 29: EmDash 1.3.1,
Astro 7.4.4, Wrangler 4.155.0, Cloudflare Agents 0.31.0, ai-chat 0.12.2,
AI SDK 7.0.156, Anthropic provider 4.0.91, React 19.3.1, React Router 8.5.1,
Vite 8.3.5, and Vitest 5.0.5. Other direct dependencies and compatible transitive
ranges were refreshed in the same lockfile.

Compatibility choices:

- **SonicJS 2.19 stays.** SonicJS 3 changes the CMS data model and authentication.
  Existing SonicJS blogs need a separate migration, explicitly excluded here.
- **Astro uses TypeScript 6.0.3.** The current `astro check` rejects TypeScript 7.0.
  All other TypeScript workspaces use 7.0.2. Do not remove type checking merely to
  claim every workspace uses the same compiler.
- **Legend State stays on its existing v3 beta line**, updated to beta.48. Its
  npm `latest` tag points to v2 and would downgrade the application.
- **EmDash packages stay exactly pinned**, including the provisioner's auth and
  schema-test dependencies. `emdash-legacy-0-22` is a deliberate test fixture,
  not a production dependency to update.
- React/React DOM overrides keep one runtime across source-consumed workspaces.
  Tiptap core, PM, and extensions are aligned at 3.32.1 to avoid an editor built
  against a newer core API resolving an older peer.

The retained SonicJS 2 package reports older Drizzle/Workers type peer ranges.
Agents 0.31 also reports Babel 7/8 peer warnings in its decorator tooling.
Workspace builds and checks pass; these upstream peer declarations are not a
reason to force unrelated core-CMS migrations or global Babel overrides.

## Required source adaptations

- AI SDK 7 instructions, lifecycle callbacks, stop conditions, stateless UI
  streaming, and provider v4 usage middleware replace their v6 forms.
- Clerk Core 3 uses `@clerk/react`, `@clerk/ui/themes`, and `Show` for signed-in
  conditions. Its new offline token error must not sign a user out.
- Svix 2 signature verification returns no payload. Parse and validate the raw
  JSON after successful verification; reject unsigned or tampered requests.
- Cloudflare's Vitest integration is now `@cloudflare/vitest-plugin`, including
  test TypeScript entries. Scout tests stub unused external service bindings.
- Astro 7.4.4 adapts its workerd render stream upstream; the Astro 6.4.6 pnpm
  patch is removed. Keep real article and 404 probes: a successful home page or
  production build alone does not prove sanitizer-dependent routes work.
- Preact 11 components use explicit Preact JSX settings.

## Verification

```bash
pnpm install --frozen-lockfile
pnpm -r typecheck
pnpm -r build
pnpm --filter @hotmetal/shared test
pnpm --filter @hotmetal/provisioner test
pnpm --filter @hotmetal/publisher exec vitest run
pnpm --filter @hotmetal/content-scout exec vitest run
```

For a machine without a supported prebuilt native SQLite binary, install/link
with `pnpm install --ignore-scripts`, then run `pnpm rebuild --pending`. The root
`node-gyp` development dependency supplies the compiler driver; system C/C++
build tools and Python are still required. Do not leave required native modules
unbuilt.

The shared tests exercise AI structured output, successful/failed tool
continuation, aggregate usage, streaming, persisted message replay, and signed
Clerk webhooks. Provisioner contracts cover fresh EmDash 1.3.1 schemas and the
legacy 0.22 upgrade path. Against a disposable local instance, also run
`scripts/emdash-integration-test.ts` and `scripts/emdash-update-path-test.ts`.
Neither script should target production.

Several other workspaces have test script stubs but no test files. Running all
scripts with an extra `--run` also duplicates that flag for existing run-mode
scripts under Vitest 5. Use the targeted commands above; do not count empty
suites as executed coverage.

Before a tenant rollout, follow [the fleet runbook](emdash-phase3-runbook.md):
inspect exact migration targets, capture D1/R2 recovery points, publish one
immutable bundle with its matching manifest, canary one tenant, and verify admin,
content API, public pages, article bodies, feeds, and browser script MIME types.
New publications must select the same released bundle through the provisioner.

## Primary references

- [EmDash updates](https://docs.emdashcms.com/deployment/updating/)
- [EmDash core migrations](https://docs.emdashcms.com/deployment/core-migrations/)
- [AI SDK 7 migration](https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0)
- [Clerk Core 3 migration](https://clerk.com/docs/guides/development/upgrading/upgrade-guides/core-3)
- [Cloudflare Vitest migration](https://developers.cloudflare.com/workers/testing/vitest-integration/migration-guides/migrate-to-vitest-plugin/)
- [Preact 11 TypeScript](https://preactjs.com/guide/v11/typescript/)
