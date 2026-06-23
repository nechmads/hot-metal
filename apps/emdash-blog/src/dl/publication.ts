import type { Publication, SocialLinks } from '@hotmetal/data-layer';
import { blogEnv } from '../lib/runtime';

const SAFE_URL_PATTERN = /^https?:\/\//;

function sanitizeSocialLinks(links: SocialLinks | null): SocialLinks | null {
  if (!links) return null;
  const sanitized: SocialLinks = {};
  for (const key of ['twitter', 'linkedin', 'github', 'website'] as const) {
    if (links[key] && SAFE_URL_PATTERN.test(links[key])) {
      sanitized[key] = links[key];
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

/**
 * Branding for the single publication this EmDash instance serves. Mirrors the
 * shape `publications-web` uses so the shared template components are identical.
 */
export interface PublicationBranding {
  name: string;
  slug: string;
  description: string | null;
  tagline: string | null;
  logoUrl: string | null;
  headerImageUrl: string | null;
  accentColor: string | null;
  socialLinks: SocialLinks | null;
  metaDescription: string | null;
  templateId: string;
  /** Whether the comment feature is enabled for this publication. */
  commentsEnabled: boolean;
}

function brandingFromPublication(publication: Publication): PublicationBranding {
  return {
    name: publication.name,
    slug: publication.slug,
    description: publication.description,
    tagline: publication.tagline,
    logoUrl: publication.logoUrl,
    headerImageUrl: publication.headerImageUrl,
    accentColor: publication.accentColor,
    socialLinks: sanitizeSocialLinks(publication.socialLinks),
    metaDescription: publication.metaDescription,
    templateId: publication.templateId,
    commentsEnabled: publication.commentsEnabled,
  };
}

/**
 * Fallback branding from env vars / defaults — used for local `astro preview`
 * (no DAL binding) so the blog still renders. Deployed instances always resolve
 * branding from the DAL (the user-editable source of truth).
 */
function fallbackBranding(): PublicationBranding {
  return {
    name: blogEnv.PUBLICATION_NAME ?? 'Hot Metal Blog',
    slug: blogEnv.PUBLICATION_SLUG ?? 'blog',
    description: blogEnv.PUBLICATION_DESCRIPTION ?? null,
    tagline: blogEnv.PUBLICATION_TAGLINE ?? null,
    logoUrl: blogEnv.PUBLICATION_LOGO_URL ?? null,
    headerImageUrl: null,
    accentColor: blogEnv.PUBLICATION_ACCENT ?? null,
    socialLinks: null,
    metaDescription: blogEnv.PUBLICATION_DESCRIPTION ?? null,
    templateId: blogEnv.PUBLICATION_TEMPLATE ?? 'starter',
    commentsEnabled: false,
  };
}

/**
 * Resolve this instance's publication branding: prefer the live DAL record
 * (always current with what the user edits in the dashboard), fall back to env
 * config when the DAL is unreachable.
 */
export async function getBranding(): Promise<PublicationBranding> {
  const slug = blogEnv.PUBLICATION_SLUG;
  if (blogEnv.DAL && slug) {
    try {
      const publication = await blogEnv.DAL.getPublicationBySlug(slug);
      if (publication) return brandingFromPublication(publication);
    } catch {
      // Fall through to env/default branding so the page still renders.
    }
  }
  return fallbackBranding();
}
