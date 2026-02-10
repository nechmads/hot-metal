import type { WriterAgent } from './agent/writer-agent'

export interface WriterAgentEnv {
  WRITER_DB: D1Database
  WRITER_AGENT: DurableObjectNamespace<WriterAgent>
  ANTHROPIC_API_KEY: string
  CMS_URL: string
  CMS_API_KEY: string
  WRITER_API_KEY: string
  ALEXANDER_API_URL: string
  ALEXANDER_API_KEY: string
}
