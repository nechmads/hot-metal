import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare as cfVitePlugin } from '@cloudflare/vite-plugin';

// When STACK=true, start bound services as auxiliary workers in the same dev session.
// Usage: STACK=true pnpm dev  (or use root `pnpm dev:stack-pub`)
const stackPlugins = process.env.STACK
  ? [
      cfVitePlugin({
        persistState: { path: '../../.wrangler/shared-state' },
        auxiliaryWorkers: [
          { configPath: '../../services/data-layer/wrangler.jsonc' },
          { configPath: '../../services/content-scout/wrangler.jsonc' },
          { configPath: '../../services/publisher/wrangler.jsonc' },
        ],
      }),
    ]
  : [];

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  server: { port: 4322 },
  vite: {
    plugins: [tailwindcss(), ...stackPlugins],
  },
});
