declare namespace Cloudflare {
	interface Env {
		DAL: import('@hotmetal/data-layer').DataLayerApi;
		WRITER_AGENT_URL: string;
		WRITER_API_KEY: string;
		CONTENT_SCOUT_URL: string;
		SCOUT_API_KEY: string;
		ALEXANDER_API_URL: string;
		ALEXANDER_API_KEY: string;
		// Clerk auth
		CLERK_PUBLISHABLE_KEY: string;
		CLERK_SECRET_KEY: string;
	}
}
interface Env extends Cloudflare.Env {}
