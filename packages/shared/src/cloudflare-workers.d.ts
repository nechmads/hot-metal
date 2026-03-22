// Minimal type declaration for cloudflare:workers env access.
// The shared package runs inside Cloudflare Workers but doesn't need
// the full @cloudflare/workers-types — just the env accessor.
// Each consuming worker provides its own full Env type.
declare module 'cloudflare:workers' {
  const env: Record<string, unknown>
  export { env }
}
