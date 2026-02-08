import { describe, it, expect } from 'vitest'
import { formatForLinkedIn } from '../../src/linkedin/formatter'

describe('formatForLinkedIn', () => {
  it('formats a basic post with title and content', () => {
    const result = formatForLinkedIn('My Title', '<p>Hello world</p>', undefined)

    expect(result).toContain('My Title')
    expect(result).toContain('Hello world')
    expect(result).not.toContain('<p>')
    expect(result).not.toContain('</p>')
  })

  it('includes the hook before the content', () => {
    const result = formatForLinkedIn('Title', '<p>Body text</p>', 'This is the hook')

    const hookIndex = result.indexOf('This is the hook')
    const bodyIndex = result.indexOf('Body text')

    expect(hookIndex).toBeGreaterThan(-1)
    expect(bodyIndex).toBeGreaterThan(hookIndex)
  })

  it('strips HTML tags from content', () => {
    const html = '<h2>Heading</h2><p>Paragraph with <strong>bold</strong> and <a href="#">links</a></p>'
    const result = formatForLinkedIn('Title', html, undefined)

    expect(result).not.toContain('<h2>')
    expect(result).not.toContain('<strong>')
    expect(result).not.toContain('<a')
    expect(result).toContain('Heading')
    expect(result).toContain('bold')
    expect(result).toContain('links')
  })

  it('decodes HTML entities', () => {
    const html = '<p>A &amp; B &lt; C &gt; D &quot;E&quot; &#39;F&#39;</p>'
    const result = formatForLinkedIn('Title', html, undefined)

    expect(result).toContain('A & B < C > D "E" \'F\'')
  })

  it('adds footer when includeFooter is true', () => {
    const result = formatForLinkedIn('Title', '<p>Content</p>', undefined, {
      includeFooter: true,
      blogUrl: 'https://blog.example.com/posts/my-post',
    })

    expect(result).toContain('Originally published at https://blog.example.com/posts/my-post')
  })

  it('does not add footer when includeFooter is false', () => {
    const result = formatForLinkedIn('Title', '<p>Content</p>', undefined, {
      includeFooter: false,
      blogUrl: 'https://blog.example.com/posts/my-post',
    })

    expect(result).not.toContain('Originally published at')
  })

  it('truncates content exceeding 3000 characters', () => {
    const longContent = '<p>' + 'A'.repeat(3500) + '</p>'
    const result = formatForLinkedIn('Title', longContent, undefined)

    expect(result.length).toBeLessThanOrEqual(3000)
    expect(result).toMatch(/\.\.\.$/s)
  })

  it('preserves paragraph breaks', () => {
    const html = '<p>First paragraph</p><p>Second paragraph</p>'
    const result = formatForLinkedIn('Title', html, undefined)

    expect(result).toContain('First paragraph')
    expect(result).toContain('Second paragraph')
    // Should have blank lines between paragraphs
    expect(result).toMatch(/First paragraph\n\nSecond paragraph/s)
  })
})
