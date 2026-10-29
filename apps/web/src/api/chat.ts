import { Hono } from 'hono'
import type { AppEnv } from '../server'
import { sendWriterMessageSync } from '../bl/writer-conversations'
import { createGenerationDependencies } from '../infrastructure/generation-dependencies'
import { readTopicBody } from '../http/topics'

const chat = new Hono<AppEnv>()
/** Non-streaming dashboard counterpart of the same writer engine used by MCP. */
chat.post('/sessions/:sessionId/chat', async (c) => {
  const body = await readTopicBody<{ message: string }>(c)
  const result = await sendWriterMessageSync(
    { userId: c.get('userId'), credentialKind: 'clerk' },
    {
      sessionId: c.req.param('sessionId'),
      message: body.message,
    },
    createGenerationDependencies(c.env),
  )
  return c.json(result)
})
export default chat
