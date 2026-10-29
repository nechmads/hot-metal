import { Hono } from 'hono'
import type { AppEnv } from '../../server'
import {
  createTopic,
  deleteTopic,
  listTopics,
  updateTopic,
  type CreateTopicCommand,
  type UpdateTopicCommand,
} from '../../bl/topics'
import { readTopicBody, topicContext } from '../../http/topics'

const topics = new Hono<AppEnv>()

topics.get('/publications/:pubId/topics', async (c) => {
  const { caller, dependencies } = topicContext(c, 'api-key')
  return c.json({
    data: await listTopics(caller, c.req.param('pubId'), dependencies),
  })
})

topics.post('/publications/:pubId/topics', async (c) => {
  const body = await readTopicBody<Omit<CreateTopicCommand, 'publicationId'>>(c)
  const { caller, dependencies } = topicContext(c, 'api-key')
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
  return c.json({ data: topic }, 201)
})

topics.patch('/topics/:id', async (c) => {
  const body = await readTopicBody<UpdateTopicCommand>(c)
  const { caller, dependencies } = topicContext(c, 'api-key')
  return c.json({
    data: await updateTopic(caller, c.req.param('id'), body, dependencies),
  })
})

topics.delete('/topics/:id', async (c) => {
  const { caller, dependencies } = topicContext(c, 'api-key')
  await deleteTopic(caller, c.req.param('id'), dependencies)
  return c.json({ data: { deleted: true } })
})

export default topics
