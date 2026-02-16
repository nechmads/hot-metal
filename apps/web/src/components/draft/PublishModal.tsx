import { useEffect, useState, useCallback } from 'react'
import { CheckCircleIcon, GlobeIcon, ImageIcon, LinkedinLogoIcon, XLogoIcon, SparkleIcon, CaretDownIcon, LinkSimpleIcon } from '@phosphor-icons/react'
import { Modal } from '@/components/modal/Modal'
import { Loader } from '@/components/loader/Loader'
import { fetchPublications, fetchDrafts, fetchDraft, generateSeo, generateTweet, generateLinkedInPost, publishDraft, getLinkedInStatus, getTwitterStatus } from '@/lib/api'
import type { PublicationConfig } from '@/lib/types'

const TCO_URL_LENGTH = 23

function calculateTweetLength(text: string): number {
  const urlRegex = /https?:\/\/\S+/g
  let length = text.length
  const urls = text.match(urlRegex)
  if (urls) {
    for (const url of urls) {
      length = length - url.length + TCO_URL_LENGTH
    }
  }
  return length
}

interface PublishModalProps {
  isOpen: boolean
  onClose: () => void
  sessionId: string
  draftTitle: string | null
  featuredImageUrl?: string | null
  sessionPublicationId?: string | null
  onPublished: (postId: string) => void
  isRepublish?: boolean
}

function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Strip Markdown syntax to plain text for platforms that don't support it (e.g. LinkedIn). */
function stripMarkdown(md: string): string {
  return md
    // Remove code blocks (``` ... ```)
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove images
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // Convert links to just the text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Remove heading markers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic (order matters: bold first, then italic)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Remove blockquote markers
    .replace(/^>\s?/gm, '')
    // Remove unordered list markers
    .replace(/^[\s]*[-*+]\s+/gm, '')
    // Remove ordered list markers
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Collapse 3+ newlines into 2
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// --- Collapsible social card ---

interface SocialCardProps {
  icon: React.ReactNode
  label: string
  connected: boolean
  selected: boolean
  onToggle: (checked: boolean) => void
  accentColor: string
  accentBorder: string
  accentBg: string
  children: React.ReactNode
  collapsedSummary?: string
  disabledText?: string
}

function SocialCard({ icon, label, connected, selected, onToggle, accentColor, accentBorder, accentBg, children, collapsedSummary, disabledText }: SocialCardProps) {
  const [expanded, setExpanded] = useState(false)

  // Auto-expand when toggled on, collapse when toggled off
  useEffect(() => {
    if (selected) {
      setExpanded(true)
    } else {
      setExpanded(false)
    }
  }, [selected])

  const handleCheckboxChange = (checked: boolean) => {
    onToggle(checked)
  }

  return (
    <div
      className={`rounded-lg border transition-colors ${
        connected
          ? selected
            ? `${accentBorder} ${accentBg}`
            : 'border-[#e5e7eb] hover:border-[#d1d5db] dark:border-[#374151] dark:hover:border-[#4b5563]'
          : 'border-[#e5e7eb] opacity-50 dark:border-[#374151]'
      }`}
    >
      {/* Card header — full row is clickable to toggle */}
      <div
        className={`flex items-center gap-2.5 px-3 py-2 ${connected ? 'cursor-pointer select-none' : ''}`}
        onClick={() => { if (connected) handleCheckboxChange(!selected) }}
      >
        {connected ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => handleCheckboxChange(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            className={`h-3.5 w-3.5 rounded border-[#d1d5db] ${accentColor}`}
          />
        ) : (
          <input type="checkbox" disabled className="h-3.5 w-3.5 rounded border-[#d1d5db] opacity-50" />
        )}
        {icon}
        <span className="text-sm font-medium text-[#0a0a0a] dark:text-[#fafafa]">{label}</span>

        {!connected && (
          <span className="text-[10px] text-[#9ca3af]">{disabledText || 'Connect in Settings'}</span>
        )}

        {/* Collapsed summary */}
        {connected && selected && !expanded && collapsedSummary && (
          <span className="ml-auto truncate text-xs text-[#9ca3af]">{collapsedSummary}</span>
        )}

        {/* Expand/collapse caret */}
        {connected && selected && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
            className="ml-auto rounded p-0.5 text-[#9ca3af] transition-colors hover:text-[#6b7280]"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <CaretDownIcon
              size={14}
              className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      </div>

      {/* Collapsible content with CSS grid animation */}
      <div
        className={`grid transition-all duration-200 ${
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Main modal ---

export function PublishModal({ isOpen, onClose, sessionId, draftTitle, featuredImageUrl, sessionPublicationId, onPublished, isRepublish }: PublishModalProps) {
  const [slug, setSlug] = useState('')
  const [author, setAuthor] = useState('')
  const [tags, setTags] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [hook, setHook] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [generatingSeo, setGeneratingSeo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [published, setPublished] = useState(false)
  const [lastPublishMessage, setLastPublishMessage] = useState('')

  // Publications state
  const [publications, setPublications] = useState<PublicationConfig[]>([])
  const [selectedPubId, setSelectedPubId] = useState<string | null>(null)
  const [blogSelected, setBlogSelected] = useState(false)
  const [loadingPubs, setLoadingPubs] = useState(false)

  // LinkedIn connection state
  const [linkedinConnected, setLinkedinConnected] = useState(false)
  const [linkedinSelected, setLinkedinSelected] = useState(false)

  // Twitter / X connection state
  const [twitterConnected, setTwitterConnected] = useState(false)
  const [twitterSelected, setTwitterSelected] = useState(false)
  const [tweetText, setTweetText] = useState('')
  const [tweetTextEdited, setTweetTextEdited] = useState(false)
  const [generatingTweet, setGeneratingTweet] = useState(false)
  const [tweetFromAI, setTweetFromAI] = useState(false)

  // LinkedIn post state
  const [linkedInPostType, setLinkedInPostType] = useState<'link' | 'text'>('link')
  const [linkedInText, setLinkedInText] = useState('')
  const [linkedInTextEdited, setLinkedInTextEdited] = useState(false)
  const [generatingLinkedIn, setGeneratingLinkedIn] = useState(false)
  const [linkedInFromAI, setLinkedInFromAI] = useState(false)
  const [loadingDraftBody, setLoadingDraftBody] = useState(false)

  // Load publications + auto-generate slug/SEO when modal opens
  useEffect(() => {
    if (!isOpen) {
      setError(null)
      setPublished(false)
      setPublishing(false)
      setLastPublishMessage('')
      setHook('')
      setExcerpt('')
      setTags('')
      setSlug('')
      setSelectedPubId(null)
      setBlogSelected(false)
      setLinkedinSelected(false)
      setTwitterSelected(false)
      setTweetText('')
      setTweetTextEdited(false)
      setGeneratingTweet(false)
      setTweetFromAI(false)
      setLinkedInPostType('link')
      setLinkedInText('')
      setLinkedInTextEdited(false)
      setGeneratingLinkedIn(false)
      setLinkedInFromAI(false)
      setLoadingDraftBody(false)
      return
    }

    if (draftTitle) {
      setSlug(slugify(draftTitle))
    }

    let cancelled = false
    setLoadingPubs(true)

    fetchPublications()
      .then((pubs) => {
        if (cancelled) return
        setPublications(pubs)
        // Auto-select publication on first publish; leave unchecked on re-publish
        if (pubs.length > 0 && !isRepublish) {
          setBlogSelected(true)
          if (sessionPublicationId && pubs.some((p) => p.id === sessionPublicationId)) {
            setSelectedPubId(sessionPublicationId)
          } else {
            setSelectedPubId(pubs[0].id)
          }
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load publications. Please close and try again.')
      })
      .finally(() => {
        if (!cancelled) setLoadingPubs(false)
      })

    getLinkedInStatus()
      .then(({ connected }) => { if (!cancelled) setLinkedinConnected(connected) })
      .catch(() => { if (!cancelled) setLinkedinConnected(false) })

    getTwitterStatus()
      .then(({ connected }) => { if (!cancelled) setTwitterConnected(connected) })
      .catch(() => { if (!cancelled) setTwitterConnected(false) })

    setGeneratingSeo(true)
    generateSeo(sessionId)
      .then((seo) => {
        if (cancelled) return
        if (seo.hook) setHook(seo.hook)
        if (seo.excerpt) setExcerpt(seo.excerpt)
        if (seo.tags) setTags(seo.tags)
      })
      .catch(() => { /* best-effort */ })
      .finally(() => { if (!cancelled) setGeneratingSeo(false) })

    return () => { cancelled = true }
  }, [isOpen, sessionId, draftTitle, sessionPublicationId, isRepublish])

  // Set author from selected publication's defaultAuthor
  useEffect(() => {
    if (!selectedPubId) return
    const pub = publications.find((p) => p.id === selectedPubId)
    if (pub?.defaultAuthor) setAuthor(pub.defaultAuthor)
  }, [selectedPubId, publications])

  // Fire AI tweet generation when X is toggled ON (and user hasn't edited)
  const fireTweetGeneration = useCallback((hookText?: string) => {
    if (tweetTextEdited) return

    setGeneratingTweet(true)
    setTweetFromAI(false)

    generateTweet(sessionId, hookText)
      .then(({ tweet }) => {
        if (tweet) {
          setTweetText(tweet)
          setTweetFromAI(true)
        }
      })
      .catch(() => {
        // Fallback: use hook or title
        const fallback = hookText?.trim() || draftTitle || ''
        setTweetText(fallback)
      })
      .finally(() => {
        setGeneratingTweet(false)
      })
  }, [sessionId, draftTitle, tweetTextEdited])

  const handleTwitterToggle = useCallback((checked: boolean) => {
    setTwitterSelected(checked)
    if (checked && !tweetTextEdited && !generatingTweet) {
      fireTweetGeneration(hook)
    }
  }, [hook, tweetTextEdited, generatingTweet, fireTweetGeneration])

  // Re-trigger tweet generation when hook arrives (if X is already selected but tweet isn't ready yet)
  useEffect(() => {
    if (twitterSelected && hook && !tweetTextEdited && !tweetFromAI && !generatingTweet) {
      fireTweetGeneration(hook)
    }
  }, [hook, twitterSelected, tweetTextEdited, tweetFromAI, generatingTweet, fireTweetGeneration])

  const tweetLength = calculateTweetLength(tweetText)
  // Account for the link that will be appended
  const effectiveTweetLength = tweetText.trim() ? tweetLength + 1 + TCO_URL_LENGTH : 0 // space + t.co link
  const tweetOverLimit = twitterSelected && effectiveTweetLength > 280

  // LinkedIn: default text population when toggled on or mode changes
  useEffect(() => {
    if (!linkedinSelected || linkedInTextEdited) return
    // Wait for publications to load so we can build the real URL
    if (loadingPubs) return

    if (linkedInPostType === 'link') {
      // Default to the hook text for link posts
      setLinkedInText(hook || '')
      setLinkedInFromAI(false)
    } else {
      // Text mode: fetch full draft body
      let cancelled = false
      setLoadingDraftBody(true)
      fetchDrafts(sessionId)
        .then((drafts) => {
          if (cancelled || drafts.length === 0) return
          const latest = drafts[drafts.length - 1]
          return fetchDraft(sessionId, latest.version)
        })
        .then((draft) => {
          if (cancelled || !draft) return
          const title = draft.title || draftTitle || 'Untitled'
          // Strip Markdown — LinkedIn only supports plain text
          const plainContent = stripMarkdown(draft.content)
          const parts = [title, '', plainContent]
          let text = parts.join('\n').trim()
          // Build footer with publication link
          const pubId = selectedPubId || sessionPublicationId
          const pubSlug = pubId ? publications.find((p) => p.id === pubId)?.slug : undefined
          const postSlug = slug || (draftTitle ? slugify(draftTitle) : '')
          const postUrl = pubSlug && postSlug ? `https://${pubSlug}.hotmetalapp.com/${postSlug}` : ''
          const footer = `\n\nRead the full article: ${postUrl || '[link will be added when published]'}`
          const maxBody = 3000 - footer.length
          if (text.length > maxBody) {
            // Cut at last paragraph break before the limit for a clean truncation
            const cut = text.slice(0, maxBody - 3)
            const lastBreak = cut.lastIndexOf('\n\n')
            text = lastBreak > maxBody * 0.5 ? cut.slice(0, lastBreak).trimEnd() + '...' : cut.trimEnd() + '...'
          }
          text += footer
          setLinkedInText(text)
          setLinkedInFromAI(false)
        })
        .catch(() => {
          setLinkedInText(hook || draftTitle || '')
        })
        .finally(() => {
          if (!cancelled) setLoadingDraftBody(false)
        })

      return () => { cancelled = true }
    }
  }, [linkedinSelected, linkedInPostType, hook, sessionId, draftTitle, linkedInTextEdited, selectedPubId, sessionPublicationId, publications, slug, loadingPubs])

  // LinkedIn: update link mode text when hook arrives
  useEffect(() => {
    if (linkedinSelected && linkedInPostType === 'link' && !linkedInTextEdited && hook) {
      setLinkedInText(hook)
    }
  }, [hook, linkedinSelected, linkedInPostType, linkedInTextEdited])

  const handleOptimizeLinkedIn = useCallback(() => {
    setGeneratingLinkedIn(true)
    setLinkedInFromAI(false)

    generateLinkedInPost(sessionId, {
      mode: linkedInPostType,
      hook: hook || undefined,
      currentText: linkedInPostType === 'text' ? linkedInText : undefined,
    })
      .then(({ linkedInPost }) => {
        if (linkedInPost) {
          setLinkedInText(linkedInPost)
          setLinkedInFromAI(true)
        }
      })
      .catch(() => {
        // Silent failure — keep current text
      })
      .finally(() => {
        setGeneratingLinkedIn(false)
      })
  }, [sessionId, linkedInPostType, hook, linkedInText])

  const linkedInCharCount = linkedInText.length
  const linkedInOverLimit = linkedinSelected && linkedInPostType === 'text' && linkedInCharCount > 3000

  const hasAnyDestination = selectedPubId !== null || twitterSelected || linkedinSelected
  const needsSlug = selectedPubId !== null

  const handlePublish = async () => {
    if (publishing || !hasAnyDestination) return
    if (needsSlug && !slug.trim()) return
    setPublishing(true)
    setError(null)

    try {
      const result = await publishDraft(sessionId, {
        slug: slug.trim(),
        author: author.trim() || undefined,
        tags: tags.trim() || undefined,
        excerpt: excerpt.trim() || undefined,
        hook: hook.trim() || undefined,
        publicationId: selectedPubId || undefined,
        publishToLinkedIn: linkedinSelected || undefined,
        publishToTwitter: twitterSelected || undefined,
        tweetText: twitterSelected && tweetText.trim() ? tweetText.trim() : undefined,
        linkedInText: linkedinSelected && linkedInText.trim() ? linkedInText.trim() : undefined,
        linkedInPostType: linkedinSelected ? linkedInPostType : undefined,
      })

      // Build success message from actual results
      const parts: string[] = []
      if (selectedPubId) {
        parts.push('Published successfully')
      }
      if (result.socialResults) {
        for (const sr of result.socialResults) {
          if (sr.platform === 'linkedin') {
            parts.push(sr.success ? 'Shared on LinkedIn' : (sr.error || 'LinkedIn share failed'))
          } else if (sr.platform === 'twitter') {
            parts.push(sr.success ? 'Posted on X' : (sr.error || 'X post failed'))
          }
        }
      }
      setLastPublishMessage(parts.join('. ') + '.')
      setPublished(true)
      // Reset social toggles so user can pick new destinations for re-publish
      setLinkedinSelected(false)
      setTwitterSelected(false)
      setTweetText('')
      setTweetTextEdited(false)
      setTweetFromAI(false)
      setLinkedInPostType('link')
      setLinkedInText('')
      setLinkedInTextEdited(false)
      setLinkedInFromAI(false)
      if (result.results[0]?.postId) {
        onPublished(result.results[0].postId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish')
    } finally {
      setPublishing(false)
    }
  }

  const inputClass = 'w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#6b7280] focus:border-[#d97706] focus:outline-none focus:ring-1 focus:ring-[#d97706] dark:border-[#374151] dark:bg-[#1a1a1a] dark:text-[#fafafa]'

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-lg">
        <div className="flex flex-col">
          {/* Fixed header */}
          <div className="border-b border-[#e5e7eb] px-5 py-4 dark:border-[#374151]">
            <h3 className="text-lg font-semibold">
              {isRepublish ? 'Share' : published ? 'Publish Again' : 'Publish Draft'}
            </h3>
          </div>

          {/* Scrollable body */}
          <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
            <div className="space-y-2">
              {/* Success banner */}
              {published && (
                <div className="flex items-center gap-2.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 dark:border-green-800 dark:bg-green-900/20">
                  <CheckCircleIcon size={18} weight="fill" className="shrink-0 text-green-500" />
                  <p className="text-xs text-green-700 dark:text-green-400">
                    {lastPublishMessage}{!isRepublish && ' Select additional destinations below to publish again.'}
                  </p>
                </div>
              )}

              {/* Publications card — hidden on re-publish (social-only) */}
              {!isRepublish && <SocialCard
                icon={<GlobeIcon size={16} className="text-[#d97706]" />}
                label="Publications"
                connected={!loadingPubs && publications.length > 0}
                selected={blogSelected}
                onToggle={(checked) => {
                  setBlogSelected(checked)
                  if (!checked) {
                    setSelectedPubId(null)
                  } else if (!selectedPubId) {
                    if (sessionPublicationId && publications.some((p) => p.id === sessionPublicationId)) {
                      setSelectedPubId(sessionPublicationId)
                    } else if (publications.length > 0) {
                      setSelectedPubId(publications[0].id)
                    }
                  }
                }}
                accentColor="accent-[#d97706]"
                accentBorder="border-[#d97706]"
                accentBg="bg-[#d97706]/5"
                collapsedSummary={selectedPubId ? publications.find((p) => p.id === selectedPubId)?.name : undefined}
                disabledText={loadingPubs ? 'Loading...' : 'Create one first'}
              >
                <div className="space-y-3">
                  {loadingPubs ? (
                    <div className="flex items-center gap-2 py-1">
                      <Loader size={12} />
                      <span className="text-xs text-[#6b7280]">Loading publications...</span>
                    </div>
                  ) : (
                    <>
                      {/* Publication selection */}
                      <div className="space-y-1.5">
                        {publications.map((pub) => (
                          <label
                            key={pub.id}
                            className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors ${
                              selectedPubId === pub.id
                                ? 'border-[#d97706] bg-[#d97706]/5'
                                : 'border-[#e5e7eb] hover:border-[#d97706]/30 dark:border-[#374151]'
                            }`}
                          >
                            <input
                              type="radio"
                              name="publication"
                              checked={selectedPubId === pub.id}
                              onChange={() => setSelectedPubId(pub.id)}
                              className="h-3.5 w-3.5 border-[#d1d5db] accent-[#d97706]"
                            />
                            <span className="text-sm font-medium text-[#0a0a0a] dark:text-[#fafafa]">
                              {pub.name}
                            </span>
                            {pub.description && (
                              <span className="truncate text-xs text-[#9ca3af]">
                                {pub.description}
                              </span>
                            )}
                          </label>
                        ))}
                      </div>

                      {/* Blog Details */}
                      <div className="space-y-3 border-t border-[#e5e7eb] pt-3 dark:border-[#374151]">
                        {/* Featured Image preview */}
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[#6b7280]">Featured Image</label>
                          {featuredImageUrl ? (
                            <div className="flex items-center gap-3">
                              <img src={featuredImageUrl} alt="Featured" className="h-16 w-16 rounded-lg object-cover" />
                              <span className="text-xs text-[#6b7280]">Image selected</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 rounded-lg border border-dashed border-[#e5e7eb] px-3 py-2 dark:border-[#374151]">
                              <ImageIcon size={16} className="text-[#9ca3af]" />
                              <span className="text-xs text-[#9ca3af]">No featured image</span>
                            </div>
                          )}
                        </div>

                        {/* Slug + Author in 2-col grid */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="publish-slug" className="mb-1 block text-xs font-medium text-[#6b7280]">Slug</label>
                            <input id="publish-slug" type="text" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-blog-post" className={inputClass} />
                          </div>
                          <div>
                            <label htmlFor="publish-author" className="mb-1 block text-xs font-medium text-[#6b7280]">Author</label>
                            <input id="publish-author" type="text" value={author} onChange={(e) => setAuthor(e.target.value)} className={inputClass} />
                          </div>
                        </div>

                        {/* Tags */}
                        <div>
                          <label htmlFor="publish-tags" className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[#6b7280]">
                            Tags <span className="font-normal text-[#9ca3af]">(comma-separated)</span>
                            {generatingSeo && <Loader size={10} />}
                          </label>
                          <input
                            id="publish-tags"
                            type="text"
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            placeholder={generatingSeo ? 'Generating...' : 'tech, ai, writing'}
                            className={inputClass}
                          />
                        </div>

                        {/* Hook */}
                        <div>
                          <label htmlFor="publish-hook" className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[#6b7280]">
                            Hook
                            {generatingSeo && <Loader size={10} />}
                            {!generatingSeo && hook && (
                              <span className="flex items-center gap-0.5 text-[#d97706]">
                                <SparkleIcon size={10} weight="fill" />
                                <span className="text-[10px]">AI</span>
                              </span>
                            )}
                          </label>
                          <textarea
                            id="publish-hook"
                            value={hook}
                            onChange={(e) => setHook(e.target.value)}
                            placeholder={generatingSeo ? 'Generating...' : 'A short opening to grab readers...'}
                            rows={2}
                            className={`${inputClass} resize-none`}
                          />
                        </div>

                        {/* Excerpt */}
                        <div>
                          <label htmlFor="publish-excerpt" className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[#6b7280]">
                            Excerpt
                            {generatingSeo && <Loader size={10} />}
                            {!generatingSeo && excerpt && (
                              <span className="flex items-center gap-0.5 text-[#d97706]">
                                <SparkleIcon size={10} weight="fill" />
                                <span className="text-[10px]">AI</span>
                              </span>
                            )}
                          </label>
                          <textarea
                            id="publish-excerpt"
                            value={excerpt}
                            onChange={(e) => setExcerpt(e.target.value)}
                            placeholder={generatingSeo ? 'Generating...' : 'A brief summary for SEO and previews...'}
                            rows={2}
                            className={`${inputClass} resize-none`}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </SocialCard>}

              {/* X (Twitter) card */}
              <SocialCard
                icon={<XLogoIcon size={16} weight="fill" className="text-[#0a0a0a] dark:text-white" />}
                label="X"
                connected={twitterConnected}
                selected={twitterSelected}
                onToggle={handleTwitterToggle}
                accentColor="accent-[#0a0a0a] dark:accent-white"
                accentBorder="border-[#0a0a0a] dark:border-white"
                accentBg="bg-[#0a0a0a]/5 dark:bg-white/5"
                collapsedSummary="Tweet will be posted"
              >
                <div className="space-y-1.5">
                  <label htmlFor="tweet-text" className="flex items-center justify-between text-xs font-medium text-[#6b7280]">
                    <span className="flex items-center gap-1.5">
                      Tweet text
                      {generatingTweet && <Loader size={10} />}
                      {!generatingTweet && tweetFromAI && (
                        <span className="flex items-center gap-0.5 text-[#d97706]">
                          <SparkleIcon size={10} weight="fill" />
                          <span className="text-[10px]">AI</span>
                        </span>
                      )}
                    </span>
                    <span className={`tabular-nums ${tweetOverLimit ? 'font-semibold text-red-500' : ''}`}>
                      {effectiveTweetLength}/280
                    </span>
                  </label>
                  <textarea
                    id="tweet-text"
                    value={tweetText}
                    onChange={(e) => { setTweetText(e.target.value); setTweetTextEdited(true); setTweetFromAI(false) }}
                    placeholder={generatingTweet ? 'Generating tweet...' : 'What do you want to tweet?'}
                    disabled={generatingTweet}
                    rows={3}
                    className={`w-full resize-none rounded-lg border bg-white px-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#6b7280] focus:outline-none focus:ring-1 disabled:opacity-60 dark:bg-[#1a1a1a] dark:text-[#fafafa] ${
                      tweetOverLimit
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                        : 'border-[#e5e7eb] focus:border-[#d97706] focus:ring-[#d97706] dark:border-[#374151]'
                    }`}
                  />
                  {tweetOverLimit && (
                    <p className="text-[10px] text-red-500">
                      Tweet exceeds 280 characters. Shorten the text to publish.
                    </p>
                  )}
                  <p className="flex items-center gap-1 text-[10px] text-[#9ca3af]">
                    <LinkSimpleIcon size={10} />
                    Link to your blog post will be included
                  </p>
                </div>
              </SocialCard>

              {/* LinkedIn card */}
              <SocialCard
                icon={<LinkedinLogoIcon size={16} weight="fill" className="text-[#0A66C2]" />}
                label="LinkedIn"
                connected={linkedinConnected}
                selected={linkedinSelected}
                onToggle={setLinkedinSelected}
                accentColor="accent-[#0A66C2]"
                accentBorder="border-[#0A66C2]"
                accentBg="bg-[#0A66C2]/5"
                collapsedSummary={linkedInPostType === 'link' ? 'Link post' : 'Text post'}
              >
                <div className="space-y-3">
                  {/* Post type toggle */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setLinkedInPostType('link'); setLinkedInTextEdited(false) }}
                      className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        linkedInPostType === 'link'
                          ? 'border-[#0A66C2] bg-[#0A66C2]/10 text-[#0A66C2]'
                          : 'border-[#e5e7eb] text-[#6b7280] hover:border-[#d1d5db] dark:border-[#374151] dark:text-[#9ca3af]'
                      }`}
                    >
                      Link Post
                    </button>
                    <button
                      type="button"
                      onClick={() => { setLinkedInPostType('text'); setLinkedInTextEdited(false) }}
                      className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        linkedInPostType === 'text'
                          ? 'border-[#0A66C2] bg-[#0A66C2]/10 text-[#0A66C2]'
                          : 'border-[#e5e7eb] text-[#6b7280] hover:border-[#d1d5db] dark:border-[#374151] dark:text-[#9ca3af]'
                      }`}
                    >
                      Text Post
                    </button>
                  </div>

                  {/* Post type description */}
                  <p className="text-[10px] text-[#9ca3af]">
                    {linkedInPostType === 'link'
                      ? 'Hook text with an article preview card linking to your blog post.'
                      : 'Full post as a standalone LinkedIn text post. A link to your blog will be added at the end.'}
                  </p>

                  {/* Text editor */}
                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between text-xs font-medium text-[#6b7280]">
                      <span className="flex items-center gap-1.5">
                        {linkedInPostType === 'link' ? 'Hook' : 'Post text'}
                        {(generatingLinkedIn || loadingDraftBody) && <Loader size={10} />}
                        {!generatingLinkedIn && !loadingDraftBody && linkedInFromAI && (
                          <span className="flex items-center gap-0.5 text-[#d97706]">
                            <SparkleIcon size={10} weight="fill" />
                            <span className="text-[10px]">AI</span>
                          </span>
                        )}
                      </span>
                      {linkedInPostType === 'text' && (
                        <span className={`tabular-nums ${linkedInOverLimit ? 'font-semibold text-red-500' : ''}`}>
                          {linkedInCharCount}/3000
                        </span>
                      )}
                    </label>
                    <textarea
                      value={linkedInText}
                      onChange={(e) => { setLinkedInText(e.target.value); setLinkedInTextEdited(true); setLinkedInFromAI(false) }}
                      placeholder={
                        generatingLinkedIn ? 'Optimizing...'
                          : loadingDraftBody ? 'Loading draft...'
                          : linkedInPostType === 'link' ? 'A short hook to grab readers...'
                          : 'Full post text...'
                      }
                      disabled={generatingLinkedIn || loadingDraftBody}
                      rows={linkedInPostType === 'link' ? 3 : 6}
                      className={`w-full resize-none rounded-lg border bg-white px-3 py-2 text-sm text-[#0a0a0a] placeholder:text-[#6b7280] focus:outline-none focus:ring-1 disabled:opacity-60 dark:bg-[#1a1a1a] dark:text-[#fafafa] ${
                        linkedInOverLimit
                          ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                          : 'border-[#e5e7eb] focus:border-[#d97706] focus:ring-[#d97706] dark:border-[#374151]'
                      }`}
                    />
                    {linkedInOverLimit && (
                      <p className="text-[10px] text-red-500">
                        Text exceeds 3000 characters. Shorten to publish.
                      </p>
                    )}
                  </div>

                  {/* Optimize button — only for text posts; hook is already good for link posts */}
                  {linkedInPostType === 'text' && (
                    <button
                      type="button"
                      onClick={handleOptimizeLinkedIn}
                      disabled={generatingLinkedIn || loadingDraftBody}
                      className="flex items-center gap-1.5 rounded-lg border border-[#0A66C2]/30 px-3 py-1.5 text-xs font-medium text-[#0A66C2] transition-colors hover:bg-[#0A66C2]/5 disabled:opacity-50"
                    >
                      <SparkleIcon size={12} weight="fill" />
                      {generatingLinkedIn ? 'Optimizing...' : 'Optimize for LinkedIn'}
                    </button>
                  )}

                  {/* Footer note */}
                  <p className="flex items-center gap-1 text-[10px] text-[#9ca3af]">
                    <LinkSimpleIcon size={10} />
                    {linkedInPostType === 'link'
                      ? 'Article preview card with your blog link will be attached'
                      : 'Link to your blog post will be included at the end'}
                  </p>
                </div>
              </SocialCard>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mx-5 mb-0 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Fixed footer */}
          <div className="flex justify-end gap-2 border-t border-[#e5e7eb] px-5 py-4 dark:border-[#374151]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#e5e7eb] px-4 py-2 text-sm font-medium text-[#0a0a0a] transition-colors hover:bg-[#f5f5f5] dark:border-[#374151] dark:text-[#fafafa] dark:hover:bg-[#1a1a1a]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing || !hasAnyDestination || (needsSlug && !slug.trim()) || tweetOverLimit || linkedInOverLimit}
              className="flex items-center gap-1.5 rounded-lg bg-[#d97706] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#b45309] disabled:opacity-50"
            >
              {publishing ? (
                <>
                  <Loader size={14} />
                  Publishing...
                </>
              ) : isRepublish ? (
                'Share'
              ) : published ? (
                'Publish Again'
              ) : (
                'Publish'
              )}
            </button>
          </div>
        </div>
    </Modal>
  )
}
