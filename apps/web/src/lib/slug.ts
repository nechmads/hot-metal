/**
 * URL-safe slug: lowercase, non-alphanumerics collapsed to single dashes.
 *
 * Dashes are stripped after truncation as well as before it, so a title cut
 * mid-word at the length cap still yields a slug matching `SLUG_PATTERN`.
 */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.slice(0, 80)
		.replace(/^-+|-+$/g, '')
}

/** Matches a slug that `slugify` would produce: `foo`, `foo-bar`, never `-foo-`. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
