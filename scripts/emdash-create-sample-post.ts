/**
 * Create + publish a sample post in a running EmDash instance, to eyeball the
 * frontend templates. Exercises the real write path (markdown -> Portable Text
 * via EmdashCmsClient), the same one WriterAgent/scout/publisher use.
 *
 * Prereqs: an EmDash instance running at BASE_URL (e.g. `pnpm preview:emdash`),
 * seeded with emdash/seed.json, and an `ec_pat_` (mint via
 * ../emdash-spike/src/seed-live-d1.ts — see docs/emdash-instance-deploy.md).
 *
 * Usage:
 *   BASE_URL=http://localhost:4321 PAT=ec_pat_... pnpm tsx scripts/emdash-create-sample-post.ts
 */
import { EmdashCmsClient } from '../packages/shared/src/emdash-cms-client'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4321'
const PAT = process.env.PAT

if (!PAT) {
  console.error('✗ Set PAT=ec_pat_... (and optionally BASE_URL). See the script header.')
  process.exit(2)
}

const markdown = `## Why structured content wins

Hot Metal publishes to **multiple outlets** from a single source. Markdown is the
source of truth; EmDash stores [Portable Text](https://portabletext.org).

### Key benefits

- Lossless round-trips
- Clean semantic rendering
- One design system, many templates

> Structured content is the foundation of a durable publishing pipeline.

Here is some \`inline code\` and a fenced block:

\`\`\`ts
const x = markdownToPortableText(md)
\`\`\`

That's the gist.`

async function main() {
  const client = new EmdashCmsClient(BASE_URL, PAT!)
  const post = await client.createPost({
    publicationId: process.env.PUB_SLUG ?? 'demo',
    title: 'Rendering Portable Text with parity',
    subtitle: 'A sample post exercising the EmDash frontend templates',
    slug: 'rendering-portable-text-with-parity',
    hook: 'Proving the EmDash blog matches the publications-web design system.',
    excerpt: 'A sample post exercising the EmDash frontend templates and the markdown-to-Portable-Text path.',
    content: markdown,
    markdown,
    status: 'published',
    author: 'Hot Metal',
    tags: 'portable-text, astro',
    topics: 'Engineering',
    featuredImage: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1200',
    citations: [{ title: 'Portable Text spec', url: 'https://portabletext.org', publisher: 'Sanity' }],
    seoTitle: 'Rendering Portable Text with parity',
    seoDescription: 'How the EmDash blog renders Portable Text to match the Hot Metal design system.',
  } as Parameters<EmdashCmsClient['createPost']>[0])

  console.log(`✅ Published "${post.title}"`)
  console.log(`   View: ${BASE_URL}/${post.slug}`)
}

main().catch((e) => {
  console.error('✗ Failed:', e)
  process.exit(1)
})
