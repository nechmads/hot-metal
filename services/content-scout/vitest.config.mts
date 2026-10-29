import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Run tests in the Workers runtime through Cloudflare's Vitest plugin.
export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: './wrangler.jsonc' },
			miniflare: {
				serviceBindings: {
					DAL: () => new Response('Unexpected DAL call', { status: 503 }),
					WEB: () => new Response('Unexpected web call', { status: 503 }),
					NOTIFICATIONS: () => new Response('Unexpected notification call', { status: 503 }),
				},
			},
		}),
	],
	test: {},
});
