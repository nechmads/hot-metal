import sanitizeHtml from 'sanitize-html';

export function sanitizeCmsContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img',
      'h1',
      'h2',
      'h3',
      'figure',
      'figcaption',
    ],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'loading', 'width', 'height', 'class'],
      a: ['href', 'target', 'rel', 'class'],
      '*': ['class', 'id'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
}
