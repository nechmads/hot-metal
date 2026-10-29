import { Hono } from 'hono'
import type { AppEnv } from '../server'
import {
  createTopic,
  deleteTopic,
  listTopics,
  updateTopic,
  type CreateTopicCommand,
  type UpdateTopicCommand,
} from '../bl/topics'
import {
  readTopicBody,
  topicBusinessErrorResponse,
  topicContext,
} from '../http/topics'
import { errorHandler } from '../middleware/error-handler'

const topics = new Hono<AppEnv>()

topics.onError(
  (error, c) =>
    topicBusinessErrorResponse(error, c, 'dashboard') ?? errorHandler(error, c),
)

topics.post('/publications/:pubId/topics', async (c) => {
  const body = await readTopicBody<Omit<CreateTopicCommand, 'publicationId'>>(c)
  const { caller, dependencies } = topicContext(c, 'clerk')
  const topic = await createTopic(
    caller,
    {
      publicationId: c.req.param('pubId'),
      name: body.name,
      description: body.description,
      priority: body.priority,
    },
    dependencies,
  )
  return c.json(topic, 201)
})

topics.get('/publications/:pubId/topics', async (c) => {
  const { caller, dependencies } = topicContext(c, 'clerk')
  return c.json({
    data: await listTopics(caller, c.req.param('pubId'), dependencies),
  })
})

topics.patch('/topics/:id', async (c) => {
  const body = await readTopicBody<UpdateTopicCommand>(c)
  const { caller, dependencies } = topicContext(c, 'clerk')
  return c.json(
    await updateTopic(caller, c.req.param('id'), body, dependencies),
  )
})

topics.delete('/topics/:id', async (c) => {
  const { caller, dependencies } = topicContext(c, 'clerk')
  await deleteTopic(caller, c.req.param('id'), dependencies)
  return c.json({ deleted: true })
})

export default topics
