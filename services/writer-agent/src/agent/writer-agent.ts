import { AIChatAgent } from 'agents/ai-chat-agent'
import { anthropic } from '@ai-sdk/anthropic'
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, generateText, streamText, stepCountIs, type StreamTextOnFinishCallback, type ToolSet } from 'ai'
import type { Connection, WSMessage } from 'partyserver'
import type { WriterAgentEnv } from '../env'
import { type WriterAgentState, type WritingPhase, INITIAL_STATE } from './state'
import { initAgentSqlite } from './sqlite-schema'
import { buildSystemPrompt } from '../prompts/system-prompt'
import { createToolSet } from '../tools'
import { cleanupMessages } from './message-utils'
import { CmsApi } from '@hotmetal/shared'
import { marked } from 'marked'

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

export class WriterAgent extends AIChatAgent<WriterAgentEnv, WriterAgentState> {
  initialState: WriterAgentState = INITIAL_STATE

  async onStart() {
    initAgentSqlite(this.sql.bind(this))

    // Hydrate state from D1 session metadata if this is a fresh start
    if (!this.state.sessionId) {
      const sessionId = this.name
      const row = await this.env.WRITER_DB
        .prepare('SELECT id, user_id, title, status, current_draft_version, cms_post_id, publication_id, seed_context FROM sessions WHERE id = ?')
        .bind(sessionId)
        .first<{ id: string; user_id: string; title: string | null; current_draft_version: number; cms_post_id: string | null; publication_id: string | null; seed_context: string | null }>()

      if (row) {
        this.setState({
          ...this.state,
          sessionId: row.id,
          userId: row.user_id,
          title: row.title,
          currentDraftVersion: row.current_draft_version ?? 0,
          cmsPostId: row.cms_post_id,
          publicationId: row.publication_id,
          seedContext: row.seed_context,
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

  private prepareLlmCall() {
    const newPhase = this.state.writingPhase === 'idle' ? 'interviewing' : this.state.writingPhase
    this.setState({
      ...this.state,
      isGenerating: true,
      lastError: null,
      writingPhase: newPhase,
    })

    const systemPrompt = buildSystemPrompt({
      phase: this.state.writingPhase,
      sessionTitle: this.state.title,
      currentDraftVersion: this.state.currentDraftVersion,
      seedContext: this.state.seedContext,
    })

    const tools = createToolSet(this)

    return { systemPrompt, tools }
  }

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal },
  ) {
    const { systemPrompt, tools } = this.prepareLlmCall()
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
    const { systemPrompt, tools } = this.prepareLlmCall()

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

  async handleGenerateSeo(): Promise<Response> {
    const draft = this.getCurrentDraft()
    if (!draft) {
      return Response.json({ error: 'No draft exists.' }, { status: 400 })
    }

    // Truncate content to avoid using too many tokens
    const contentPreview = draft.content.length > 4000
      ? draft.content.slice(0, 4000) + '\n\n[truncated]'
      : draft.content

    try {
      const result = await generateText({
        model: anthropic('claude-haiku-3-5-20241022'),
        system: `You are an SEO expert for a technology blog. Given a blog post, generate:
1. An SEO-optimized excerpt (1-2 sentences, max 160 characters, compelling and descriptive)
2. Relevant tags (3-6 tags, comma-separated, lowercase)

Respond in JSON format only:
{"excerpt": "...", "tags": "tag1, tag2, tag3"}`,
        messages: [
          {
            role: 'user',
            content: `Title: ${draft.title || 'Untitled'}\n\n${contentPreview}`,
          },
        ],
      })

      const text = result.text.trim()
      // Extract JSON from the response (handle potential markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return Response.json({ error: 'Failed to parse SEO suggestions' }, { status: 502 })
      }

      const seo = JSON.parse(jsonMatch[0]) as { excerpt?: string; tags?: string }

      return Response.json({
        excerpt: seo.excerpt || '',
        tags: seo.tags || '',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate SEO data'
      return Response.json({ error: message }, { status: 502 })
    }
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

    let body: { slug: string; author?: string; tags?: string; excerpt?: string }
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
      let parsedCitations: unknown
      try {
        parsedCitations = draft.citations ? JSON.parse(draft.citations) : undefined
      } catch {
        console.warn(`Invalid citations JSON for draft v${draft.version}, skipping`)
        parsedCitations = undefined
      }

      // Extract hook as plain text (first non-empty line, stripped of markdown)
      const firstContentLine = draft.content.split('\n').find((line) => line.trim().length > 0)
      const hook = firstContentLine
        ?.replace(/^#+\s*/, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/`/g, '')
        .trim() || undefined

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
        citations: parsedCitations as undefined,
        publishedAt: new Date().toISOString(),
        publicationId: this.state.publicationId ?? undefined,
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

  getEnv(): WriterAgentEnv {
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
