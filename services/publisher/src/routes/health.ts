import { Hono } from 'hono'
import type { PublisherEnv } from '../env'

const health = new Hono<{ Bindings: PublisherEnv }>()

health.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'hotmetal-publisher' })
})

export default health
