declare namespace Cloudflare {
	interface Env {
		DAL: import('@hotmetal/data-layer').DataLayerApi;
		WRITER_AGENT_URL: string;
		WRITER_API_KEY: string;
		CONTENT_SCOUT_URL: string;
		SCOUT_API_KEY: string;
		// Clerk auth (JWKS-based — no secret key needed)
		CLERK_PUBLISHABLE_KEY: string;
		CLERK_ISSUER: string;
	}
}
interface Env extends Cloudflare.Env {}
