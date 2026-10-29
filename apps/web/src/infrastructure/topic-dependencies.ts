import type { DataLayerApi } from '@hotmetal/data-layer'
import type { TopicDependencies } from '../bl/topics'

type TopicDataLayer = Pick<
  DataLayerApi,
  | 'getUserById'
  | 'getPublicationById'
  | 'getTopicById'
  | 'listTopicsByPublication'
  | 'countTopicsByPublication'
  | 'createTopic'
  | 'updateTopic'
  | 'deleteTopic'
>

/** Adapt the DAL binding to the small ports consumed by topic business operations. */
export function createTopicDependencies(
  dal: TopicDataLayer,
): TopicDependencies {
  return {
    users: { getById: (id) => dal.getUserById(id) },
    publications: { getById: (id) => dal.getPublicationById(id) },
    topics: {
      getById: (id) => dal.getTopicById(id),
      listByPublication: (id) => dal.listTopicsByPublication(id),
      countByPublication: (id) => dal.countTopicsByPublication(id),
      create: (input) => dal.createTopic(input),
      update: (id, input) => dal.updateTopic(id, input),
      delete: (id) => dal.deleteTopic(id),
    },
    newId: () => crypto.randomUUID(),
  }
}
