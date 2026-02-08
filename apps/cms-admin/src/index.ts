/**
 * Hot Metal CMS Application
 *
 * Entry point for the SonicJS headless CMS
 */

import { createSonicJSApp, registerCollections } from '@sonicjs-cms/core'
import type { SonicJSConfig } from '@sonicjs-cms/core'

import publicationsCollection from './collections/publications.collection'
import postsCollection from './collections/posts.collection'
import renditionsCollection from './collections/renditions.collection'
import apiV1 from './routes/api-v1'

registerCollections([
  publicationsCollection,
  postsCollection,
  renditionsCollection,
])

const config: SonicJSConfig = {
  collections: {
    autoSync: true,
  },
  plugins: {
    directory: './src/plugins',
    autoLoad: false,
  },
  routes: [{ path: '/api/v1', handler: apiV1 }],
}

export default createSonicJSApp(config)
