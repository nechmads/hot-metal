import { defineConfig } from 'vitest/config'

// Bootstrap is pure logic (EmDash token crypto + ULID + SQL statement building),
// so a plain Node environment is enough — no Workers pool needed.
export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/**/*.spec.ts'],
	},
})
