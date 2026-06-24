// EmDash collection types for the Hot Metal publication schema.
//
// EmDash normally regenerates this on `astro dev` start (from the DB binding,
// no auth) and via `emdash types` (HTTP, needs a `schema:read` PAT). We commit
// it as source so `astro check` is reproducible in CI without a live instance.
// It mirrors `seed/seed.json` exactly — keep the two in sync when the schema
// changes (running `astro dev` will rewrite this file to match the seed).

/// <reference types="emdash/locals" />

import type { ContentBylineCredit, TaxonomyTerm, PortableTextBlock } from "emdash";

export interface Post {
  id: string;
  slug: string | null;
  status: string;
  title: string;
  subtitle?: string;
  hook?: string;
  content?: PortableTextBlock[];
  html?: string;
  markdown?: string;
  excerpt?: string;
  featured_image_url?: string;
  tags?: string;
  topics?: string;
  citations?: string;
  seo_title?: string;
  seo_description?: string;
  canonical_url?: string;
  og_image?: string;
  author?: string;
  publication_id?: string;
  hm_status?: string;
  hm_published_at?: string;
  hm_scheduled_at?: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  bylines?: ContentBylineCredit[];
  terms?: Record<string, TaxonomyTerm[]>;
}

export interface Rendition {
  id: string;
  slug: string | null;
  status: string;
  post_id: string;
  outlet?: string;
  content?: string;
  rendition_status?: string;
  format_rules_version?: string;
  external_id?: string;
  external_url?: string;
  outlet_published_at?: string;
  last_generated_at?: string;
  last_edited_at?: string;
  publish_errors?: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  bylines?: ContentBylineCredit[];
  terms?: Record<string, TaxonomyTerm[]>;
}

declare module "emdash" {
  interface EmDashCollections {
    posts: Post;
    renditions: Rendition;
  }
}
