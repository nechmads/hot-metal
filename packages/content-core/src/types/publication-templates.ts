/**
 * The publication templates a user can choose from.
 *
 * Kept here — beside the other publication models — because the same list is
 * needed by the settings UI, the internal API, the agents API and its OpenAPI
 * spec. It previously lived as a string literal in each of those, which is how
 * a template can end up selectable but unvalidated, or validated but unlisted.
 *
 * `id` is what is stored in `publications.template_id` and what the blog
 * frontends switch on, so these strings are a persisted contract: add freely,
 * but never rename or remove one without migrating the rows that reference it.
 */
export interface PublicationTemplate {
  id: string
  name: string
  /** One line, shown under the picker in publication settings. */
  description: string
}

export const PUBLICATION_TEMPLATES = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Clean, minimal, content-focused design.',
  },
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Magazine-style with serif typography and drop caps.',
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'Tech-forward with geometric layout and thick borders.',
  },
  {
    id: 'press-machine',
    name: 'Press Machine',
    description:
      'A newspaper front page: ruled columns, a commanding lead headline, and a typographic date plate where a post has no image.',
  },
  {
    id: 'one-signal',
    name: 'One Signal',
    description:
      'A dark dispatch log: a numbered index instead of cards, with a long-form reading column.',
  },
] as const satisfies readonly PublicationTemplate[]

/** The id of a template that actually exists, narrowed from the list above. */
export type PublicationTemplateId = (typeof PUBLICATION_TEMPLATES)[number]['id']

export const PUBLICATION_TEMPLATE_IDS: readonly PublicationTemplateId[] =
  PUBLICATION_TEMPLATES.map((t) => t.id)

export const DEFAULT_PUBLICATION_TEMPLATE_ID: PublicationTemplateId = 'starter'

/** Narrows on success, so a checked id can be assigned to `PublicationTemplateId`. */
export function isValidTemplateId(templateId: string): templateId is PublicationTemplateId {
  return (PUBLICATION_TEMPLATE_IDS as readonly string[]).includes(templateId)
}
