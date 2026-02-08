import type { CollectionConfig } from '@sonicjs-cms/core'

export default {
  name: 'renditions',
  displayName: 'Renditions',
  description: 'Per-outlet content variants of posts',
  icon: '📤',

  schema: {
    type: 'object',
    properties: {
      post: {
        type: 'reference',
        title: 'Post',
        collection: 'posts',
        helpText: 'The canonical post this rendition is based on',
      },
      outlet: {
        type: 'select',
        title: 'Outlet',
        enum: ['blog', 'linkedin', 'medium', 'substack'],
        enumLabels: ['Blog', 'LinkedIn', 'Medium', 'Substack'],
        default: 'blog',
      },
      content: {
        // 'quill' is a SonicJS runtime widget type not in the FieldType union
        type: 'quill' as any,
        title: 'Content',
      },
      status: {
        type: 'select',
        title: 'Status',
        enum: ['draft', 'ready', 'scheduled', 'published', 'failed'],
        enumLabels: ['Draft', 'Ready', 'Scheduled', 'Published', 'Failed'],
        default: 'draft',
      },
      formatRulesVersion: {
        type: 'string',
        title: 'Format Rules Version',
        helpText: 'Semver of format rules used to generate this rendition',
      },
      externalId: {
        type: 'string',
        title: 'External ID',
        helpText: 'ID on the external platform after publishing',
      },
      externalUrl: {
        type: 'url',
        title: 'External URL',
        helpText: 'URL on the external platform',
      },
      publishedAt: {
        type: 'datetime',
        title: 'Published At',
      },
      lastGeneratedAt: {
        type: 'datetime',
        title: 'Last Generated At',
        helpText: 'When AI last generated this rendition',
      },
      lastEditedAt: {
        type: 'datetime',
        title: 'Last Edited At',
        helpText: 'When manually edited',
      },
      publishErrors: {
        type: 'json',
        title: 'Publish Errors',
        helpText: 'JSON array of error strings if publishing failed',
      },
    },
    required: ['post', 'outlet', 'content', 'status'],
  },

  listFields: ['post', 'outlet', 'status', 'publishedAt'],
  searchFields: ['outlet', 'status'],
  defaultSort: 'createdAt',
  defaultSortOrder: 'desc',
} satisfies CollectionConfig
