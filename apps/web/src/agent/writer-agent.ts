import { AIChatAgent } from '@cloudflare/ai-chat'
import { anthropic } from '@ai-sdk/anthropic'
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, generateText, streamText, stepCountIs, type StreamTextOnFinishCallback, type ToolSet } from 'ai'
import type { Connection, WSMessage } from 'partyserver'
import { type WriterAgentState, type WritingPhase, INITIAL_STATE } from './state'
import { initAgentSqlite } from './sqlite-schema'
import { buildSystemPrompt } from '../prompts/system-prompt'
import { createToolSet } from '../tools'
import { cleanupMessages } from './message-utils'
import { CmsApi } from '@hotmetal/shared'
import type { Citation } from '@hotmetal/content-core'
import { marked } from 'marked'
import { createHook, createSeoMeta, type DraftInput } from '../lib/writing'

export interface DraftRow {
  id: string
  version: number
  title: string | null
  content: string
  citations: string | null
  word_count: number
  is_final: number
  feedback: string | null
  created_at: number
}

export interface DraftSummary {
  id: string
  version: number
  title: string | null
  word_count: number
  is_final: number
  created_at: number
}

export class WriterAgent extends AIChatAgent<Env, WriterAgentState> {
  initialState: WriterAgentState = INITIAL_STATE

  async onStart() {
    initAgentSqlite(this.sql.bind(this))

    // Hydrate state from session metadata via DAL if this is a fresh start
    if (!this.state.sessionId) {
      const sessionId = this.name
      const session = await this.env.DAL.getSessionById(sessionId)

      if (session) {
        this.setState({
          ...this.state,
          sessionId: session.id,
          userId: session.userId,
          title: session.title,
          currentDraftVersion: session.currentDraftVersion ?? 0,
          cmsPostId: session.cmsPostId,
          publicationId: session.publicationId,
          seedContext: session.seedContext,
          featuredImageUrl: session.featuredImageUrl,
          styleId: session.styleId,
        })
      }
    }
  }

  /**
   * Convenience handler: wraps plain text messages into the cf_agent_use_chat_request
   * protocol envelope so that raw WebSocket clients (wscat, Postman) can send simple
   * strings instead of the full Agents SDK JSON protocol.
   */
  async onMessage(connection: Connection, message: WSMessage) {
    if (typeof message === 'string') {
      let parsed: Record<string, unknown> | null = null
      try {
        parsed = JSON.parse(message) as Record<string, unknown>
      } catch {
        // not JSON — plain text
      }

      // Already a proper agent protocol message — pass through
      if (parsed && typeof parsed.type === 'string' && parsed.type.startsWith('cf_agent_')) {
        return super.onMessage(connection, message)
      }

      // Plain text or unrecognised JSON — wrap as a chat message
      const text = parsed?.content ? String(parsed.content) : message
      const userMessage = {
        id: crypto.randomUUID(),
        role: 'user' as const,
        parts: [{ type: 'text' as const, text }],
      }
      const allMessages = [...this.messages, userMessage]

      const wrapped = JSON.stringify({
        type: 'cf_agent_use_chat_request',
        id: crypto.randomUUID(),
        init: {
          method: 'POST',
          body: JSON.stringify({ messages: allMessages }),
        },
      })

      return super.onMessage(connection, wrapped)
    }

    return super.onMessage(connection, message)
  }

  private async prepareLlmCall() {
    const newPhase = this.state.writingPhase === 'idle' ? 'interviewing' : this.state.writingPhase
    this.setState({
      ...this.state,
      isGenerating: true,
      lastError: null,
      writingPhase: newPhase,
    })

    // Resolve custom style: session > publication > default
    let customStylePrompt: string | undefined
    const styleId = this.state.styleId
    if (styleId) {
      const style = await this.env.DAL.getWritingStyleById(styleId)
      if (style) customStylePrompt = style.systemPrompt
    }
    if (!customStylePrompt && this.state.publicationId) {
      const pub = await this.env.DAL.getPublicationById(this.state.publicationId)
      if (pub?.styleId) {
        const style = await this.env.DAL.getWritingStyleById(pub.styleId)
        if (style) customStylePrompt = style.systemPrompt
      }
    }

    const systemPrompt = buildSystemPrompt({
      phase: newPhase,
      sessionTitle: this.state.title,
      currentDraftVersion: this.state.currentDraftVersion,
      seedContext: this.state.seedContext,
      customStylePrompt,
    })

    const tools = createToolSet(this)

    return { systemPrompt, tools }
  }

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal },
  ) {
    const { systemPrompt, tools } = await this.prepareLlmCall()
    const cleaned = cleanupMessages(this.messages)

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const result = streamText({
          model: anthropic('claude-sonnet-4-5-20250929'),
          system: systemPrompt,
          messages: await convertToModelMessages(cleaned),
          tools,
          stopWhen: stepCountIs(20),
          abortSignal: options?.abortSignal,
          onFinish: async (event) => {
            this.setState({
              ...this.state,
              isGenerating: false,
            })
            await (onFinish as unknown as StreamTextOnFinishCallback<typeof tools>)(event)
          },
          onError: (error) => {
            console.error('Stream error:', error)
            this.setState({
              ...this.state,
              isGenerating: false,
              lastError: error instanceof Error ? error.message : 'Unknown error',
            })
          },
        })

        writer.merge(result.toUIMessageStream())
      },
    })

    return createUIMessageStreamResponse({ stream })
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.endsWith('/drafts') && request.method === 'GET') {
      return this.handleListDrafts()
    }

    const draftVersionMatch = url.pathname.match(/\/drafts\/(\d+)$/)
    if (draftVersionMatch && request.method === 'GET') {
      return this.handleGetDraft(parseInt(draftVersionMatch[1], 10))
    }

    if (url.pathname.endsWith('/generate-seo') && request.method === 'POST') {
      return this.handleGenerateSeo()
    }

    if (url.pathname.endsWith('/publish') && request.method === 'POST') {
      return this.handlePublishToCms(request)
    }

    if (url.pathname.endsWith('/update-featured-image') && request.method === 'POST') {
      return this.handleUpdateFeaturedImage(request)
    }

    if (url.pathname.endsWith('/chat') && request.method === 'POST') {
      let body: { message?: string }
      try {
        body = await request.json() as { message?: string }
      } catch {
        return Response.json({ error: 'Invalid JSON in request body' }, { status: 400 })
      }
      if (!body.message?.trim()) {
        return Response.json({ error: 'message is required' }, { status: 400 })
      }
      return this.handleChat(body.message.trim())
    }

    // Delegate to AIChatAgent base (handles /get-messages, etc.)
    return super.onRequest(request)
  }

  async handleChat(userMessage: string): Promise<Response> {
    const { systemPrompt, tools } = await this.prepareLlmCall()

    const userMsg = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: userMessage }],
    }
    const currentMessages = [...this.messages, userMsg]
    await this.persistMessages(currentMessages)

    try {
      const modelMessages = await convertToModelMessages(currentMessages)
      const result = await generateText({
        model: anthropic('claude-sonnet-4-5-20250929'),
        system: systemPrompt,
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(20),
      })

      this.setState({ ...this.state, isGenerating: false })

      return Response.json({
        text: result.text,
        finishReason: result.finishReason,
        usage: result.usage,
      })
    } catch (error) {
      console.error('Chat error:', error)
      this.setState({
        ...this.state,
        isGenerating: false,
        lastError: error instanceof Error ? error.message : 'Unknown error',
      })
      return Response.json(
        { error: 'Failed to generate response' },
        { status: 500 },
      )
    }
  }

  async handleUpdateFeaturedImage(request: Request): Promise<Response> {
    let body: { featuredImageUrl: unknown }
    try {
      body = await request.json() as typeof body
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (body.featuredImageUrl !== null && typeof body.featuredImageUrl !== 'string') {
      return Response.json({ error: 'featuredImageUrl must be a string or null' }, { status: 400 })
    }

    this.setState({
      ...this.state,
      featuredImageUrl: body.featuredImageUrl ?? null,
    })

    return Response.json({ ok: true })
  }

  async handleGenerateSeo(): Promise<Response> {
    const draft = this.getCurrentDraft()
    if (!draft) {
      return Response.json({ error: 'No draft exists.' }, { status: 400 })
    }

    const draftInput: DraftInput = { title: draft.title, content: draft.content }

    // Run hook (Sonnet) and SEO meta (Haiku) generation in parallel
    const [hookResult, seoResult] = await Promise.allSettled([
      createHook(draftInput),
      createSeoMeta(draftInput),
    ])

    const hook = hookResult.status === 'fulfilled' ? hookResult.value : ''
    const { excerpt, tags } = seoResult.status === 'fulfilled'
      ? seoResult.value
      : { excerpt: '', tags: '' }

    if (hookResult.status === 'rejected') {
      console.error('Hook generation failed:', hookResult.reason)
    }
    if (seoResult.status === 'rejected') {
      console.error('SEO meta generation failed:', seoResult.reason)
    }

    return Response.json({ hook, excerpt, tags })
  }

  async handlePublishToCms(request: Request): Promise<Response> {
    const draft = this.getCurrentDraft()
    if (!draft) {
      return Response.json({ error: 'No draft exists to publish.' }, { status: 400 })
    }

    if (this.state.writingPhase === 'published') {
      return Response.json({ error: 'This session has already been published.' }, { status: 409 })
    }

    if (this.state.writingPhase === 'publishing') {
      return Response.json({ error: 'A publish operation is already in progress.' }, { status: 429 })
    }

    let body: { slug: string; author?: string; tags?: string; excerpt?: string; hook?: string }
    try {
      body = await request.json() as typeof body
    } catch {
      return Response.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }

    const slug = body.slug?.trim()
    if (!slug) {
      return Response.json({ error: 'slug is required' }, { status: 400 })
    }

    const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    if (!slugPattern.test(slug)) {
      return Response.json(
        { error: 'Slug must contain only lowercase letters, numbers, and hyphens' },
        { status: 400 },
      )
    }

    this.setWritingPhase('publishing')

    try {
      let parsedCitations: Citation[] | undefined
      try {
        parsedCitations = draft.citations ? JSON.parse(draft.citations) as Citation[] : undefined
      } catch {
        console.warn(`Invalid citations JSON for draft v${draft.version}, skipping`)
        parsedCitations = undefined
      }

      const hook = body.hook?.trim() || undefined

      // Resolve CMS publication ID from writer-agent publication
      let cmsPublicationId: string | undefined
      if (this.state.publicationId) {
        const pub = await this.env.DAL.getPublicationById(this.state.publicationId)

        if (pub?.cmsPublicationId) {
          cmsPublicationId = pub.cmsPublicationId
        } else if (pub) {
          // CMS publication wasn't created earlier — try now
          try {
            const cmsApi2 = new CmsApi(this.env.CMS_URL, this.env.CMS_API_KEY)
            const cmsPub = await cmsApi2.createPublication({ title: pub.name, slug: pub.slug })
            cmsPublicationId = cmsPub.id
            await this.env.DAL.updatePublication(this.state.publicationId, { cmsPublicationId: cmsPub.id })
          } catch (err) {
            console.error('Failed to create CMS publication during publish:', err)
          }
        }
      }

      // Convert markdown to HTML — the CMS stores content as HTML (Quill editor format)
      const htmlContent = await marked.parse(draft.content)

      const cmsApi = new CmsApi(this.env.CMS_URL, this.env.CMS_API_KEY)

      const post = await cmsApi.createPost({
        title: draft.title || 'Untitled',
        slug,
        content: htmlContent,
        status: 'published',
        author: body.author?.trim() || 'Shahar',
        tags: body.tags?.trim() || undefined,
        excerpt: body.excerpt?.trim() || undefined,
        hook,
        citations: parsedCitations,
        featuredImage: this.state.featuredImageUrl || undefined,
        publishedAt: new Date().toISOString(),
        publicationId: cmsPublicationId,
      })

      this.finalizeDraft(post.id)

      return Response.json({
        success: true,
        postId: post.id,
        slug: post.slug,
        title: post.title,
      })
    } catch (err) {
      // Revert phase so the user can retry
      this.setWritingPhase('revising')
      const message = err instanceof Error ? err.message : 'Unknown CMS error'
      return Response.json({ error: `Failed to publish: ${message}` }, { status: 502 })
    }
  }

  // --- Draft management methods (called by tools) ---

  getEnv(): Env {
    return this.env
  }

  saveDraft(title: string | null, content: string, citations: string | null, feedback: string | null): DraftRow {
    const version = this.state.currentDraftVersion + 1
    const id = crypto.randomUUID()
    const wordCount = content.split(/\s+/).filter(Boolean).length

    this.sql`INSERT INTO drafts (id, version, title, content, citations, word_count, feedback)
      VALUES (${id}, ${version}, ${title}, ${content}, ${citations}, ${wordCount}, ${feedback})`

    this.setState({
      ...this.state,
      currentDraftVersion: version,
      title: title ?? this.state.title,
      writingPhase: 'revising',
    })

    return { id, version, title, content, citations, word_count: wordCount, is_final: 0, feedback, created_at: Math.floor(Date.now() / 1000) }
  }

  getCurrentDraft(): DraftRow | null {
    const rows = this.sql<DraftRow>`SELECT * FROM drafts ORDER BY version DESC LIMIT 1`
    return rows.length > 0 ? rows[0] : null
  }

  getDraftByVersion(version: number): DraftRow | null {
    const rows = this.sql<DraftRow>`SELECT * FROM drafts WHERE version = ${version}`
    return rows.length > 0 ? rows[0] : null
  }

  listDrafts(): DraftSummary[] {
    return this.sql<DraftSummary>`SELECT id, version, title, word_count, is_final, created_at FROM drafts ORDER BY version ASC`
  }

  finalizeDraft(cmsPostId: string): void {
    const current = this.getCurrentDraft()
    if (!current) return

    // Mark current as final
    this.sql`UPDATE drafts SET is_final = 1 WHERE version = ${current.version}`

    // Clean up intermediate drafts (keep v1 + final)
    if (current.version > 1) {
      this.sql`DELETE FROM drafts WHERE version > 1 AND version < ${current.version}`
    }

    this.setState({
      ...this.state,
      writingPhase: 'published',
      cmsPostId,
    })
  }

  setWritingPhase(phase: WritingPhase): void {
    this.setState({
      ...this.state,
      writingPhase: phase,
    })
  }

  // --- HTTP handlers for draft queries ---

  private handleListDrafts(): Response {
    const drafts = this.listDrafts()
    return Response.json({ data: drafts })
  }

  private handleGetDraft(version: number): Response {
    const rows = this.sql<DraftRow>`SELECT * FROM drafts WHERE version = ${version}`
    if (rows.length === 0) {
      return Response.json({ error: 'Draft not found' }, { status: 404 })
    }
    return Response.json(rows[0])
  }
}
