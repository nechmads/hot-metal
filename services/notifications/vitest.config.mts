import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// vitest-pool-workers 0.16+ (for vitest 4) replaced `defineWorkersConfig` from
// `.../config` with the `cloudflareTest()` Vite plugin.
export default defineConfig({
	plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
	test: {},
});
