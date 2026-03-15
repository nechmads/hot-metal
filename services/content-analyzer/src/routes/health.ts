import { Hono } from 'hono'
import type { AnalyzerEnv } from '../env'

const health = new Hono<{ Bindings: AnalyzerEnv }>()

health.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'hotmetal-content-analyzer' })
})

export default health
