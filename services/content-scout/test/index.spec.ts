import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('content scout Worker', () => {
	it('serves its health check in the Workers runtime', async () => {
		const response = await SELF.fetch('https://example.com/health');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'ok', service: 'content-scout' });
	});

	it('rejects an unauthenticated scout trigger before enqueueing work', async () => {
		const response = await SELF.fetch('https://example.com/api/scout/run', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ publicationId: 'test-publication' }),
		});
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'Unauthorized' });
	});
});
