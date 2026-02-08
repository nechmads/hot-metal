import type { CollectionConfig } from '@sonicjs-cms/core'

export default {
  name: 'posts',
  displayName: 'Posts',
  description: 'Canonical blog posts with rich metadata',
  icon: '📝',

  schema: {
    type: 'object',
    properties: {
      publication: {
        type: 'reference',
        title: 'Publication',
        collection: 'publications',
        helpText: 'Which publication this post belongs to',
      },
      title: {
        type: 'string',
        title: 'Title',
        maxLength: 200,
      },
      subtitle: {
        type: 'string',
        title: 'Subtitle',
        maxLength: 200,
      },
      slug: {
        type: 'slug',
        title: 'URL Slug',
        maxLength: 200,
      },
      hook: {
        type: 'textarea',
        title: 'Hook',
        maxLength: 500,
        helpText: 'Short opening paragraph to grab readers',
      },
      content: {
        // 'quill' is a SonicJS runtime widget type not in the FieldType union
        type: 'quill' as any,
        title: 'Content',
      },
      excerpt: {
        type: 'textarea',
        title: 'Excerpt',
        maxLength: 300,
        helpText: 'Summary for cards and listings',
      },
      featuredImage: {
        type: 'media',
        title: 'Featured Image',
      },
      status: {
        type: 'select',
        title: 'Status',
        enum: ['idea', 'draft', 'review', 'scheduled', 'published', 'archived'],
        enumLabels: ['Idea', 'Draft', 'Review', 'Scheduled', 'Published', 'Archived'],
        default: 'draft',
      },
      tags: {
        type: 'string',
        title: 'Tags',
        helpText: 'Comma-separated tags',
      },
      topics: {
        type: 'string',
        title: 'Topics',
        helpText: 'Comma-separated topics',
      },
      citations: {
        type: 'textarea',
        title: 'Citations',
        helpText: 'JSON array of { url, title, publisher, accessedAt, excerpt }',
      },
      seoTitle: {
        type: 'string',
        title: 'SEO Title',
        maxLength: 70,
        helpText: 'Meta title override (defaults to post title)',
      },
      seoDescription: {
        type: 'textarea',
        title: 'SEO Description',
        maxLength: 160,
        helpText: 'Meta description override',
      },
      canonicalUrl: {
        type: 'url',
        title: 'Canonical URL',
        helpText: 'Set if this post was published elsewhere first',
      },
      ogImage: {
        type: 'media',
        title: 'OG Image',
        helpText: 'Open Graph image override',
      },
      author: {
        type: 'string',
        title: 'Author',
        default: 'Shahar',
      },
      publishedAt: {
        type: 'datetime',
        title: 'Published At',
      },
      scheduledAt: {
        type: 'datetime',
        title: 'Scheduled At',
      },
    },
    required: ['title', 'slug', 'content', 'status', 'author'],
  },

  listFields: ['title', 'status', 'author', 'publishedAt'],
  searchFields: ['title', 'excerpt', 'tags', 'topics'],
  defaultSort: 'createdAt',
  defaultSortOrder: 'desc',
} satisfies CollectionConfig
