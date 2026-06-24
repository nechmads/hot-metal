# EmDash collection seed

`seed.json` is the **canonical EmDash collection schema** for a Hot Metal
publication instance. It defines the `posts` and `renditions` collections with
**every field** our content model carries (`packages/content-core` `Post` /
`Rendition`), so `EmdashCmsClient` (`packages/shared/src/emdash-cms-client.ts`)
can store and read back content losslessly.

## Field mapping

The field slugs here match exactly what `EmdashCmsClient` writes/reads:

- **Body:** `content` is `portableText` (what EmDash renders) — converted from
  markdown on write. `markdown` (source) and `html` (rendered) are kept in side
  fields so our own read path is lossless without re-converting.
- **Status:** EmDash only has `draft|scheduled|published|archived`. Our richer
  set (`idea`, `review`, …) is preserved in `hm_status` and restored on read.
- **JSON fields:** `citations` and `publish_errors` are stored as JSON strings
  in `text` fields (EmDash's documented field types are `string|text|portableText|image`).
  EmDash returns JSON-valued text fields **already parsed** on read, so the
  client tolerates both parsed and raw-string values.

> **Reserved field names — important.** EmDash's content tables have system
> columns (`id, slug, status, author_id, created_at, updated_at, published_at,
> scheduled_at, deleted_at, version, …`). A custom field whose slug collides
> with one of these is **silently dropped by the seed loader, along with every
> field defined after it in the same collection**. That's why our status/date
> fields use non-reserved slugs: `hm_status`, `hm_published_at`, `hm_scheduled_at`
> (posts) and `rendition_status`, `outlet_published_at` (renditions). Keep new
> fields clear of the reserved names.

## Applying it

- **Phase 1 (manual instance / the spike):** copy this file to the EmDash app's
  seed location (e.g. `../emdash-spike/app/seed/seed.json`, referenced by that
  app's `package.json` `emdash.seed`), then build with a fresh D1 so the
  collections are created on first boot.
- **Phase 3 (fleet):** bake this seed into the per-tenant EmDash worker bundle so
  every provisioned instance has the same collection shape.
