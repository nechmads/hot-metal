declare namespace Cloudflare {
	interface Env {
		DAL: import('@hotmetal/data-layer').DataLayerApi;
		// Content-scout service binding + HTTP fallback
		CONTENT_SCOUT: Fetcher;
		CONTENT_SCOUT_URL: string;
		SCOUT_API_KEY: string;
		// Alexander research API
		ALEXANDER_API_URL: string;
		ALEXANDER_API_KEY: string;
		// Clerk auth
		CLERK_PUBLISHABLE_KEY: string;
		CLERK_ISSUER: string;
		// Durable Object — one WriterAgent instance per writing session
		WRITER_AGENT: DurableObjectNamespace<import('./src/agent/writer-agent').WriterAgent>;
		// Workers AI (image generation)
		AI: Ai;
		// R2 bucket (generated images)
		IMAGE_BUCKET: R2Bucket;
		// Anthropic API key (AI drafting, SEO, hooks)
		ANTHROPIC_API_KEY: string;
		// CMS admin (publishing)
		CMS_URL: string;
		CMS_API_KEY: string;
		// Publisher service binding (feed regeneration)
		PUBLISHER: Fetcher;
		PUBLISHER_API_KEY: string;
		// Service-to-service auth (content-scout auto-write)
		INTERNAL_API_KEY: string;
	}
}
interface Env extends Cloudflare.Env {}
