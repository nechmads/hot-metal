declare namespace Cloudflare {
	interface Env {
		ASSETS: Fetcher;
		WRITER_AGENT_URL: string;
		WRITER_API_KEY: string;
	}
}
interface Env extends Cloudflare.Env {}
