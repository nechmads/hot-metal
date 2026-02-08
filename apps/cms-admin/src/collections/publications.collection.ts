import type { CollectionConfig } from '@sonicjs-cms/core'

export default {
  name: 'publications',
  displayName: 'Publications',
  description: 'Publishing destinations for your content',
  icon: '📰',

  schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        title: 'Name',
        maxLength: 100,
      },
      slug: {
        type: 'slug',
        title: 'URL Slug',
        maxLength: 100,
      },
      url: {
        type: 'url',
        title: 'URL',
        helpText: 'Website URL of this publication',
        default: '',
      },
      image: {
        type: 'media',
        title: 'Image',
        helpText: 'Logo or cover image',
        default: '',
      },
    },
    required: ['title'],
  },

  listFields: ['title', 'url'],
  searchFields: ['title'],
  defaultSort: 'title',
  defaultSortOrder: 'asc',
} satisfies CollectionConfig
