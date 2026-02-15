import type { Publication, SocialLinks } from '@hotmetal/data-layer'
import type { DataLayerApi } from '@hotmetal/data-layer'

const SAFE_URL_PATTERN = /^https?:\/\//

function sanitizeSocialLinks(links: SocialLinks | null): SocialLinks | null {
  if (!links) return null
  const sanitized: SocialLinks = {}
  for (const key of ['twitter', 'linkedin', 'github', 'website'] as const) {
    if (links[key] && SAFE_URL_PATTERN.test(links[key])) {
      sanitized[key] = links[key]
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null
}

export interface PublicationBranding {
  name: string
  slug: string
  tagline: string | null
  logoUrl: string | null
  headerImageUrl: string | null
  accentColor: string | null
  socialLinks: SocialLinks | null
  metaDescription: string | null
  templateId: string
}

export async function getPublicationBySlug(
  dal: DataLayerApi,
  slug: string
): Promise<Publication | null> {
  return dal.getPublicationBySlug(slug)
}

export function getPublicationBranding(publication: Publication): PublicationBranding {
  return {
    name: publication.name,
    slug: publication.slug,
    tagline: publication.tagline,
    logoUrl: publication.logoUrl,
    headerImageUrl: publication.headerImageUrl,
    accentColor: publication.accentColor,
    socialLinks: sanitizeSocialLinks(publication.socialLinks),
    metaDescription: publication.metaDescription,
    templateId: publication.templateId,
  }
}
