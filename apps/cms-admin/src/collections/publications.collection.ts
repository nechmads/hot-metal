import type { CollectionConfig } from '@sonicjs-cms/core'

export default {
  name: 'publications',
  displayName: 'Publications',
  description: 'Publishing destinations for your content',
  icon: '📰',

  schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        title: 'Name',
        maxLength: 100,
      },
      url: {
        type: 'url',
        title: 'URL',
        helpText: 'Website URL of this publication',
      },
      image: {
        type: 'media',
        title: 'Image',
        helpText: 'Logo or cover image',
      },
    },
    required: ['name'],
  },

  listFields: ['name', 'url'],
  searchFields: ['name'],
  defaultSort: 'name',
  defaultSortOrder: 'asc',
} satisfies CollectionConfig
