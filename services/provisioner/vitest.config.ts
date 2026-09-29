import { defineConfig } from 'vitest/config'

// These tests cover pure provisioner logic plus SQLite migration/bootstrap
// contracts. Node provides the required SQLite and Web Crypto APIs, so no Workers
// pool is needed.
export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/**/*.spec.ts'],
	},
})
