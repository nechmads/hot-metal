import {
  AIChatAgent,
  type ChatRecoveryContext,
  type ChatRecoveryOptions,
} from "@cloudflare/ai-chat";
import { anthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  streamText,
  toUIMessageStream,
  isStepCount,
  wrapLanguageModel,
  type GenerateTextOnEndCallback,
  type ToolSet,
  type UIMessage,
} from "ai";
import { BusinessError } from "../bl/errors";
import { authorizeWritingSession } from "../bl/generation";
import { authorizeWriterExecution } from "../bl/writer-conversations";
import { createGenerationDependencies } from "../infrastructure/generation-dependencies";
import {
  WriterTurnStore,
  lastUserMessageId,
  type StoredWriterTurn,
} from "./mcp-writer-turns";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { AgentContext, Connection, WSMessage } from "agents";
import { MessageType, parseProtocolMessage } from "agents/chat";
import {
  type WriterAgentState,
  type WritingPhase,
  INITIAL_STATE,
} from "./state";
import { initAgentSqlite } from "./sqlite-schema";
import {
  handleMcpWriterRequest,
  parseMcpWriterCaller,
} from "./mcp-writer-requests";
import {
  buildSystemPrompt,
  buildAutonomousSystemPrompt,
} from "../prompts/system-prompt";
import { createToolSet, createAutoWriteToolSet } from "../tools";
import { cleanupMessages } from "./message-utils";
import { getCmsClient, logger } from "@hotmetal/shared";
import { resolveCmsPublicationId } from "../lib/cms-publication";
import { createWilsonMiddleware } from "@hotmetal/shared/server";
import type { Citation } from "@hotmetal/content-core";
import { marked } from "marked";
import {
  createHook,
  createSeoMeta,
  createTweet,
  optimizeForLinkedIn,
  type DraftInput,
} from "../lib/writing";

export interface DraftRow {
  id: string;
  version: number;
  title: string | null;
  content: string;
  citations: string | null;
  word_count: number;
  is_final: number;
  feedback: string | null;
  created_at: number;
}

export interface DraftSummary {
  id: string;
  version: number;
  title: string | null;
  word_count: number;
  is_final: number;
  created_at: number;
}

type ChatCompletion = Pick<
  Parameters<GenerateTextOnEndCallback<ToolSet>>[0],
  "finishReason" | "usage"
>;
type HttpChatCapture = Partial<ChatCompletion> & { error?: boolean };

export class WriterAgent extends AIChatAgent<Env, WriterAgentState> {
  initialState: WriterAgentState = INITIAL_STATE;
  private _cachedUserTier: string | null = null;
  private autoWriteInProgress = false;
  private readonly httpChatCaptures = new Map<string, HttpChatCapture>();
  private programmaticAdmissions = 0;
  private programmaticExecutions = 0;
  private ownerSocketHandlers = 0;
  private readonly ownerSocketWaiters = new Set<() => void>();
  private sdkOnMessage?: (
    connection: Connection,
    message: WSMessage,
  ) => void | Promise<void>;

  constructor(context: AgentContext, env: Env) {
    super(context, env);
    // AIChatAgent 0.12 persists WebSocket history BEFORE its turn mutex. Wrap the
    // instance handler installed by super, not only our prototype onMessage.
    const sdkOnMessage = this.onMessage.bind(this);
    this.sdkOnMessage = sdkOnMessage;
    this.onMessage = async (connection, message) => {
      const event =
        typeof message === "string" ? parseProtocolMessage(message) : null;
      const safeControl =
        event &&
        ["cancel", "stream-resume-request", "stream-resume-ack"].includes(
          event.type,
        );
      if (safeControl) return sdkOnMessage(connection, message);
      // An existing owner interaction may need its client tool result to settle
      // before a programmatic writer starts. Never accept it during execution.
      const settlingOwnerInteraction =
        event &&
        (event.type === "tool-result" || event.type === "tool-approval") &&
        this.programmaticExecutions === 0;
      if (this.programmaticAdmissions > 0 && !settlingOwnerInteraction) {
        connection.send(
          JSON.stringify({
            type: MessageType.CF_AGENT_USE_CHAT_RESPONSE,
            id: event?.type === "chat-request" ? event.id : crypto.randomUUID(),
            body: "The writer is busy. Wait for the current response, then try again.",
            done: true,
            error: true,
            outcome: "error",
          }),
        );
        return;
      }
      this.ownerSocketHandlers++;
      // A permitted owner UI submission owns its own authority, including after
      // recovery. It must never inherit a stale programmatic execution slot.
      this.writerTurns().clearExecution();
      try {
        await sdkOnMessage(connection, message);
      } finally {
        this.ownerSocketHandlers--;
        if (this.ownerSocketHandlers === 0) {
          for (const wake of this.ownerSocketWaiters) wake();
          this.ownerSocketWaiters.clear();
        }
      }
    };
  }

  private async withProgrammaticWriter<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    // Reserve synchronously, including the SDK queue/preparation interval, so a
    // UI submission cannot overwrite the history or change delegated authority.
    this.programmaticAdmissions++;
    try {
      if (this.ownerSocketHandlers > 0) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            this.ownerSocketWaiters.delete(wake);
            reject(
              new Error("Timed out waiting for the current writer response"),
            );
          }, 15 * 60_000);
          const wake = () => {
            clearTimeout(timeout);
            resolve();
          };
          this.ownerSocketWaiters.add(wake);
        });
      }
      return await operation();
    } finally {
      this.programmaticAdmissions--;
    }
  }

  async onStart() {
    initAgentSqlite(this.sql.bind(this));

    // Hydrate state from session metadata via DAL if this is a fresh start
    if (!this.state.sessionId) {
      const sessionId = this.name;
      const session = await this.env.DAL.getSessionById(sessionId);

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
        });
      }
    }

    const turns = this.writerTurns();
    turns.interruptRunning(this.nowSeconds());
    const lastUserId = lastUserMessageId(this.messages);
    if (
      lastUserId &&
      turns.byUserMessage(lastUserId)?.status === "interrupted"
    ) {
      this.setState({
        ...this.state,
        isGenerating: false,
        lastError: "The previous writer turn was interrupted",
      });
    }
    for (const row of turns.queued())
      await this.ensureWriterTurnQueued(row.turn_id);
  }

  /** Look up the user's tier from the DAL, caching it for the DO lifetime. */
  private async getUserTier(): Promise<string> {
    if (this._cachedUserTier) return this._cachedUserTier;
    try {
      const user = await this.env.DAL.getUserById(this.state.userId);
      this._cachedUserTier = user?.tier ?? "creator";
    } catch {
      this._cachedUserTier = "creator";
    }
    return this._cachedUserTier;
  }

  /** Create a model wrapped with Wilson tracking middleware. */
  async trackedModel(
    modelId: string,
    featureName: string,
    trigger: "user" | "scout" = "user",
  ): Promise<LanguageModelV4> {
    const userTier = await this.getUserTier();
    return wrapLanguageModel({
      model: anthropic(modelId),
      middleware: createWilsonMiddleware({
        userId: this.state.userId,
        userTier,
        featureName,
        publicationId: this.state.publicationId ?? undefined,
        trigger,
      }),
    });
  }

  /**
   * Convenience handler: wraps plain text messages into the cf_agent_use_chat_request
   * protocol envelope so that raw WebSocket clients (wscat, Postman) can send simple
   * strings instead of the full Agents SDK JSON protocol.
   */
  async onMessage(connection: Connection, message: WSMessage) {
    if (typeof message === "string") {
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(message) as Record<string, unknown>;
      } catch {
        // not JSON — plain text
      }

      // Already a proper agent protocol message — pass through
      if (
        parsed &&
        typeof parsed.type === "string" &&
        parsed.type.startsWith("cf_agent_")
      ) {
        return super.onMessage(connection, message);
      }

      // Plain text or unrecognised JSON — wrap as a chat message
      const text = parsed?.content ? String(parsed.content) : message;
      const userMessage = {
        id: crypto.randomUUID(),
        role: "user" as const,
        parts: [{ type: "text" as const, text }],
      };
      const allMessages = [...this.messages, userMessage];

      const wrapped = JSON.stringify({
        type: "cf_agent_use_chat_request",
        id: crypto.randomUUID(),
        init: {
          method: "POST",
          body: JSON.stringify({ messages: allMessages }),
        },
      });

      return this.sdkOnMessage?.(connection, wrapped);
    }

    return super.onMessage(connection, message);
  }

  /** Resolve custom writing style: session > publication > default. */
  private async resolveCustomStyle(): Promise<string | undefined> {
    const styleId = this.state.styleId;
    if (styleId) {
      const style = await this.env.DAL.getWritingStyleById(styleId);
      if (style) return style.finalPrompt ?? style.systemPrompt;
    }
    if (this.state.publicationId) {
      const pub = await this.env.DAL.getPublicationById(
        this.state.publicationId,
      );
      if (pub?.styleId) {
        const style = await this.env.DAL.getWritingStyleById(pub.styleId);
        if (style) return style.finalPrompt ?? style.systemPrompt;
      }
    }
    return undefined;
  }

  private async prepareLlmCall(delegated?: {
    stylePrompt?: string;
    guard: () => Promise<unknown>;
  }) {
    if (this.autoWriteInProgress)
      throw new BusinessError(
        "An auto-write operation is already in progress",
        "CONFLICT",
      );
    const newPhase =
      this.state.writingPhase === "idle"
        ? "interviewing"
        : this.state.writingPhase;
    this.setState({
      ...this.state,
      isGenerating: true,
      lastError: null,
      writingPhase: newPhase,
    });

    const customStylePrompt = delegated
      ? delegated.stylePrompt
      : await this.resolveCustomStyle();

    const systemPrompt = buildSystemPrompt({
      phase: newPhase,
      sessionTitle: this.state.title,
      currentDraftVersion: this.state.currentDraftVersion,
      seedContext: this.state.seedContext,
      customStylePrompt,
    });

    if (!delegated)
      return { systemPrompt, tools: createToolSet(this) as ToolSet };

    const tools: ToolSet = {};
    for (const [name, definition] of Object.entries(
      createAutoWriteToolSet(this),
    )) {
      const execute = definition.execute;
      if (!execute) continue;
      tools[name] = {
        ...definition,
        execute: async (input, options) => {
          await delegated.guard();
          // Each concrete tool validates its input through the unchanged AI SDK schema.
          return execute(input as never, options);
        },
      };
    }
    return {
      systemPrompt: `${systemPrompt}\n\nYou are the Hot Metal writer assisting another authorized agent. Draft, research and revise in this writing session. Publishing is performed separately by the calling assistant through the permission-checked publishDraft MCP action; do not claim to publish or use a fallback CMS destination.`,
      tools,
    };
  }

  async onChatMessage(
    onFinish: GenerateTextOnEndCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal; requestId?: string },
  ) {
    // Bind delegation to the SDK request that entered the serialized updater,
    // never to a mutable last-user message supplied by another UI submission.
    const messages = structuredClone(this.messages);
    const userMessageId = lastUserMessageId(messages);
    const store = this.writerTurns();
    const activeTurnId = store.activeExecutionId();
    const mapped = options?.requestId
      ? store.byRequest(options.requestId)
      : null;
    const delegated = mapped ?? (activeTurnId ? store.get(activeTurnId) : null);
    if (activeTurnId && (!delegated || delegated.turn_id !== activeTurnId))
      throw new BusinessError(
        "Writer request context is unavailable",
        "CONFLICT",
      );
    if (delegated) {
      // The durable slot was installed by this SDK turn's updater. Fail closed
      // if any unexpected transcript mutation has replaced its actual input.
      if (
        !options?.requestId ||
        userMessageId !== delegated.user_message_id ||
        delegated.status !== "running"
      )
        throw new BusinessError(
          "Writer request context does not match its message",
          "CONFLICT",
        );
      store.bindRequest(
        delegated.turn_id,
        options.requestId,
        this.nowSeconds(),
      );
    }
    const delegatedAbort = delegated ? new AbortController() : null;
    const guard = async () => {
      if (!delegated) return;
      try {
        return await this.authorizeDelegatedWriter(delegated);
      } catch (error) {
        const denied =
          error instanceof BusinessError &&
          ["FORBIDDEN", "NOT_FOUND"].includes(error.code);
        this.writerTurns().finish(
          delegated.turn_id,
          denied ? "cancelled" : "failed",
          denied
            ? "The originating connection is no longer authorized for this writer turn."
            : "Writer authorization is temporarily unavailable.",
          this.nowSeconds(),
        );
        delegatedAbort?.abort(error);
        throw error;
      }
    };
    let systemPrompt: string;
    let tools: ToolSet;
    try {
      const authorized = await guard();
      ({ systemPrompt, tools } = await this.prepareLlmCall(
        delegated ? { stylePrompt: authorized?.stylePrompt, guard } : undefined,
      ));
    } catch (error) {
      if (userMessageId) {
        const capture = this.httpChatCaptures.get(userMessageId);
        if (capture) capture.error = true;
      }
      if (!this.autoWriteInProgress)
        this.setState({
          ...this.state,
          isGenerating: false,
          lastError: "Failed to prepare the writer turn",
        });
      logger("web").error("Writer turn preparation failed", {
        component: "writer-agent",
        errorType: error instanceof Error ? error.name : "Unknown",
      });
      throw error;
    }

    const cleaned = cleanupMessages(messages);
    const model = await this.trackedModel("claude-sonnet-5", "chat");
    const signals = [options?.abortSignal, delegatedAbort?.signal].filter(
      (signal): signal is AbortSignal => !!signal,
    );
    const abortSignal = signals.length ? AbortSignal.any(signals) : undefined;
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        try {
          const result = streamText({
            model,
            instructions: systemPrompt,
            messages: await convertToModelMessages(cleaned),
            tools,
            stopWhen: isStepCount(20),
            abortSignal,
            prepareStep: async () => {
              await guard();
              return {};
            },
            onEnd: async (event) => {
              this.setState({
                ...this.state,
                isGenerating: false,
                lastError: null,
              });
              if (userMessageId) {
                const capture = this.httpChatCaptures.get(userMessageId);
                if (capture)
                  Object.assign(capture, {
                    finishReason: event.finishReason,
                    usage: event.usage,
                  });
              }
              await onFinish(event);
            },
            onError: () => {
              if (userMessageId) {
                const capture = this.httpChatCaptures.get(userMessageId);
                if (capture) capture.error = true;
              }
              this.setState({
                ...this.state,
                isGenerating: false,
                lastError: "The writer response could not be completed",
              });
            },
          });
          writer.merge(toUIMessageStream({ stream: result.stream, tools }));
        } catch (error) {
          this.setState({
            ...this.state,
            isGenerating: false,
            lastError: "The writer response could not be completed",
          });
          logger("web").error("Writer stream failed", {
            component: "writer-agent",
            errorType: error instanceof Error ? error.name : "Unknown",
          });
          throw error;
        }
      },
      onError: () =>
        "The writer response could not be completed. Review the conversation and drafts before retrying.",
    });
    return createUIMessageStreamResponse({ stream });
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/internal/writer/"))
      return this.handleInternalWriterRequest(request, url.pathname);

    try {
      if (url.pathname.endsWith("/drafts") && request.method === "GET") {
        return this.handleListDrafts();
      }

      const draftVersionMatch = url.pathname.match(/\/drafts\/(\d+)$/);
      if (draftVersionMatch && request.method === "GET") {
        return this.handleGetDraft(parseInt(draftVersionMatch[1], 10));
      }

      if (url.pathname.endsWith("/drafts") && request.method === "PUT") {
        return this.handleUpdateDraft(request);
      }

      if (url.pathname.endsWith("/generate-seo") && request.method === "POST") {
        return this.handleGenerateSeo();
      }

      if (
        url.pathname.endsWith("/generate-tweet") &&
        request.method === "POST"
      ) {
        return this.handleGenerateTweet(request);
      }

      if (
        url.pathname.endsWith("/generate-linkedin-post") &&
        request.method === "POST"
      ) {
        return this.handleGenerateLinkedInPost(request);
      }

      if (url.pathname.endsWith("/publish") && request.method === "POST") {
        return this.handlePublishToCms(request);
      }

      if (
        url.pathname.endsWith("/update-featured-image") &&
        request.method === "POST"
      ) {
        return this.handleUpdateFeaturedImage(request);
      }

      if (url.pathname.endsWith("/auto-write") && request.method === "POST") {
        let body: { message?: string };
        try {
          body = (await request.json()) as { message?: string };
        } catch {
          return Response.json(
            { error: "Invalid JSON in request body" },
            { status: 400 },
          );
        }
        if (!body.message?.trim()) {
          return Response.json(
            { error: "message is required" },
            { status: 400 },
          );
        }
        return this.handleAutoWrite(body.message.trim());
      }

      if (url.pathname.endsWith("/seed-draft") && request.method === "POST") {
        return this.handleSeedDraft(request);
      }

      if (url.pathname.endsWith("/chat") && request.method === "POST") {
        let body: { message?: string };
        try {
          body = (await request.json()) as { message?: string };
        } catch {
          return Response.json(
            { error: "Invalid JSON in request body" },
            { status: 400 },
          );
        }
        if (!body.message?.trim()) {
          return Response.json(
            { error: "message is required" },
            { status: 400 },
          );
        }
        return this.handleChat(body.message.trim());
      }

      // Delegate to AIChatAgent base (handles /get-messages, etc.)
      return super.onRequest(request);
    } catch (error) {
      logger("web").error("onRequest unhandled error", {
        component: "writer-agent",
        method: request.method,
        pathname: url.pathname,
        error: error instanceof Error ? error.message : String(error),
      });
      // Reset isGenerating if it was left stuck
      if (this.state.isGenerating) {
        this.setState({
          ...this.state,
          isGenerating: false,
          lastError: error instanceof Error ? error.message : "Unknown error",
        });
      }
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  async handleChat(userMessage: string): Promise<Response> {
    if (this.autoWriteInProgress)
      return Response.json(
        { error: "An auto-write operation is already in progress." },
        { status: 429 },
      );
    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: userMessage }],
    };
    const capture: HttpChatCapture = {};
    this.httpChatCaptures.set(userMsg.id, capture);
    try {
      const result = await this.withProgrammaticWriter(async () => {
        this.programmaticExecutions++;
        try {
          return await this.saveMessages((messages) => {
            this.writerTurns().clearExecution();
            return [...messages, userMsg];
          });
        } finally {
          this.programmaticExecutions--;
        }
      });
      if (result.status !== "completed" || capture.error) {
        return Response.json(
          { error: "Failed to generate response" },
          { status: 500 },
        );
      }
      const position = this.messages.findIndex(
        (message) => message.id === userMsg.id,
      );
      const replies: UIMessage[] = [];
      for (const message of this.messages.slice(position + 1)) {
        if (message.role === "user") break;
        if (message.role === "assistant") replies.push(message);
      }
      const text = replies
        .flatMap((message) =>
          message.parts
            .filter((part) => part.type === "text")
            .map((part) => part.text),
        )
        .join("\n");
      return Response.json({
        text,
        finishReason: capture.finishReason,
        usage: capture.usage,
      });
    } catch (error) {
      logger("web").error("Writer chat failed", {
        component: "writer-agent",
        errorType: error instanceof Error ? error.name : "Unknown",
      });
      return Response.json(
        { error: "Failed to generate response" },
        { status: 500 },
      );
    } finally {
      this.httpChatCaptures.delete(userMsg.id);
    }
  }

  private nowSeconds() {
    return Math.floor(Date.now() / 1000);
  }
  private writerTurns() {
    return new WriterTurnStore(this.sql.bind(this));
  }

  private async ensureWriterTurnQueued(turnId: string) {
    if (!(await this.getQueue(turnId))) {
      await this.queue(
        "runMcpWriterTurn",
        { turnId },
        { id: turnId, retry: { maxAttempts: 1 } },
      );
    }
  }

  private async authorizeDelegatedWriter(row: StoredWriterTurn) {
    if (this.writerTurns().get(row.turn_id)?.status !== "running")
      throw new BusinessError(
        "This writer turn is no longer running",
        "CONFLICT",
      );
    if (this.autoWriteInProgress)
      throw new BusinessError(
        "An auto-write operation is already in progress",
        "CONFLICT",
      );
    const stored: unknown = JSON.parse(row.caller_json);
    const caller = parseMcpWriterCaller(stored);
    const record = await authorizeWriterExecution(
      caller,
      this.name,
      createGenerationDependencies(this.env),
    );
    // Use the same authorized snapshot, never a second unchecked publication/style pointer.
    // Draft versions and writing phase belong to DO SQLite/state.
    this.setState({
      ...this.state,
      sessionId: record.id,
      userId: record.userId,
      title: record.title ?? this.state.title,
      publicationId: record.publicationId,
      styleId: record.styleId ?? null,
      seedContext: record.seedContext ?? null,
    });
    return record;
  }

  async runMcpWriterTurn(payload: unknown): Promise<void> {
    if (
      !payload ||
      typeof payload !== "object" ||
      !("turnId" in payload) ||
      typeof payload.turnId !== "string"
    )
      return;
    const turnId = payload.turnId;
    const store = this.writerTurns();
    const queued = store.get(turnId);
    if (!queued || queued.status !== "queued") return;
    try {
      await this.withProgrammaticWriter(async () => {
        // Non-chat callers must not overlap an active stream or pending client interaction.
        if (
          !(await this.waitUntilStable({
            timeout: 15 * 60_000,
            pendingInteraction: () => this.hasPendingClientInteraction(),
          }))
        ) {
          store.finish(
            turnId,
            "failed",
            "The writer is waiting for another interaction. Review the conversation before retrying.",
            this.nowSeconds(),
          );
          return;
        }
        const row = store.claim(turnId, this.nowSeconds());
        if (!row) return;
        this.programmaticExecutions++;
        try {
          const outcome = await this.saveMessages(
            async (messages) => {
              // This durable slot belongs to the SDK turn, not an actor-wide
              // caller variable. It exists before persistence/repair can yield.
              store.activateExecution(row.turn_id);
              await this.authorizeDelegatedWriter(row);
              if (
                messages.some((message) => message.id === row.user_message_id)
              ) {
                throw new Error(
                  "Writer message was already persisted without a completed receipt",
                );
              }
              return [
                ...messages,
                {
                  id: row.user_message_id,
                  role: "user" as const,
                  parts: [{ type: "text" as const, text: row.message }],
                },
              ];
            },
            { signal: AbortSignal.timeout(15 * 60_000) },
          );
          if (outcome.status === "completed") {
            await this.authorizeDelegatedWriter(row);
            store.finish(turnId, "completed", null, this.nowSeconds());
          } else {
            store.finish(
              turnId,
              outcome.status === "aborted" ? "interrupted" : "failed",
              "The writer turn did not complete. Review the conversation and drafts before sending another message.",
              this.nowSeconds(),
            );
          }
        } finally {
          store.clearExecution(row.turn_id);
          this.programmaticExecutions--;
        }
      });
    } catch (error) {
      const denied =
        error instanceof BusinessError &&
        ["FORBIDDEN", "NOT_FOUND"].includes(error.code);
      store.finish(
        turnId,
        denied ? "cancelled" : "failed",
        denied
          ? "The originating connection is no longer authorized for this writer turn."
          : "The writer turn failed. Review the conversation and drafts before sending another message.",
        this.nowSeconds(),
      );
      logger("web").warn("Delegated writer turn stopped", {
        component: "writer-agent",
        turnId,
        code: denied ? "FORBIDDEN" : "WRITER_FAILED",
      });
    } finally {
      // A successor UI turn may already have acquired the SDK slot; do not clear its state.
      if (
        !this.autoWriteInProgress &&
        lastUserMessageId(this.messages) === turnId
      ) {
        this.setState({ ...this.state, isGenerating: false });
      }
    }
  }

  protected async onChatRecovery(
    context: ChatRecoveryContext,
  ): Promise<ChatRecoveryOptions | void> {
    const store = this.writerTurns();
    const userId = lastUserMessageId(context.messages);
    const row =
      store.byRequest(context.requestId) ??
      store.byRequest(context.recoveryRootRequestId) ??
      (userId ? store.byUserMessage(userId) : null);
    if (row) {
      store.finish(
        row.turn_id,
        "interrupted",
        "The writer turn was interrupted. Review the conversation and drafts before sending another message.",
        this.nowSeconds(),
      );
      return { continue: false };
    }
    return super.onChatRecovery(context);
  }

  private handleInternalWriterRequest(request: Request, path: string) {
    return handleMcpWriterRequest(request, path, {
      internalApiKey: this.env.INTERNAL_API_KEY,
      sessionId: this.name,
      store: this.writerTurns(),
      authorize: (caller, action) =>
        action === "write"
          ? authorizeWriterExecution(
              caller,
              this.name,
              createGenerationDependencies(this.env),
            )
          : authorizeWritingSession(
              caller,
              this.name,
              "read",
              createGenerationDependencies(this.env),
            ),
      ensureQueued: (id) => this.ensureWriterTurnQueued(id),
      messages: () => this.messages,
      isAutoWriting: () => this.autoWriteInProgress,
      now: () => this.nowSeconds(),
    });
  }

  /**
   * Autonomous auto-write: writes a complete post without human interaction.
   * Used by the content-scout auto-write pipeline. Skips interviewing phase,
   * uses an autonomous system prompt, and returns the draft in the response.
   */
  async handleAutoWrite(instruction: string): Promise<Response> {
    if (
      this.state.isGenerating ||
      this.autoWriteInProgress ||
      this.programmaticAdmissions > 0
    ) {
      return Response.json(
        { error: "An auto-write operation is already in progress." },
        { status: 429 },
      );
    }

    this.autoWriteInProgress = true;
    let customStylePrompt: string | undefined;
    let systemPrompt: string;
    let tools: ReturnType<typeof createAutoWriteToolSet>;
    try {
      customStylePrompt = await this.resolveCustomStyle();
      systemPrompt = buildAutonomousSystemPrompt({
        seedContext: this.state.seedContext,
        customStylePrompt,
      });
      tools = createAutoWriteToolSet(this);
    } catch (error) {
      this.autoWriteInProgress = false;
      logger("web").error("handleAutoWrite setup failed", {
        component: "writer-agent",
        error: error instanceof Error ? error.message : String(error),
      });
      return Response.json(
        { success: false, error: "Failed to prepare auto-write" },
        { status: 500 },
      );
    }

    // Set phase directly to drafting — skip idle/interviewing
    this.setState({
      ...this.state,
      isGenerating: true,
      lastError: null,
      writingPhase: "drafting",
    });

    // 9-minute safety timeout so the DO doesn't run indefinitely
    // if the calling workflow step times out (10 min)
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 9 * 60 * 1000);

    try {
      const autoWriteModel = await this.trackedModel(
        "claude-sonnet-5",
        "auto_write",
        "scout",
      );
      const result = await generateText({
        model: autoWriteModel,
        instructions: systemPrompt,
        messages: [{ role: "user", content: instruction }],
        tools,
        stopWhen: isStepCount(30),
        abortSignal: abortController.signal,
      });

      clearTimeout(timeoutId);
      this.setState({ ...this.state, isGenerating: false });

      // Check if a draft was actually saved
      const draft = this.getCurrentDraft();
      if (!draft) {
        return Response.json(
          {
            success: false,
            error: "Agent completed but did not save a draft",
            finishReason: result.finishReason,
          },
          { status: 500 },
        );
      }

      return Response.json({
        success: true,
        draft: {
          version: draft.version,
          title: draft.title,
          content: draft.content,
          wordCount: draft.word_count,
        },
        finishReason: result.finishReason,
        usage: result.usage,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      logger("web").error("handleAutoWrite generateText failed", {
        component: "writer-agent",
        error: error instanceof Error ? error.message : String(error),
      });
      this.setState({
        ...this.state,
        isGenerating: false,
        lastError: error instanceof Error ? error.message : "Unknown error",
      });

      // Best-effort check for a partial draft saved before the error
      let draft: DraftRow | null = null;
      try {
        draft = this.getCurrentDraft();
      } catch (draftError) {
        logger("web").error(
          "handleAutoWrite failed to check for partial draft",
          {
            component: "writer-agent",
            error:
              draftError instanceof Error
                ? draftError.message
                : String(draftError),
          },
        );
      }

      if (draft) {
        return Response.json({
          success: true,
          draft: {
            version: draft.version,
            title: draft.title,
            content: draft.content,
            wordCount: draft.word_count,
          },
          partial: true,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }

      return Response.json(
        { success: false, error: "Auto-write failed" },
        { status: 500 },
      );
    } finally {
      this.autoWriteInProgress = false;
    }
  }

  async handleUpdateFeaturedImage(request: Request): Promise<Response> {
    let body: { featuredImageUrl: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (
      body.featuredImageUrl !== null &&
      typeof body.featuredImageUrl !== "string"
    ) {
      return Response.json(
        { error: "featuredImageUrl must be a string or null" },
        { status: 400 },
      );
    }

    this.setState({
      ...this.state,
      featuredImageUrl: body.featuredImageUrl ?? null,
    });

    return Response.json({ ok: true });
  }

  async handleGenerateSeo(): Promise<Response> {
    try {
      const draft = this.getCurrentDraft();
      if (!draft) {
        return Response.json({ error: "No draft exists." }, { status: 400 });
      }

      const draftInput: DraftInput = {
        title: draft.title,
        content: draft.content,
      };

      // Run hook (Sonnet) and SEO meta (Haiku) generation in parallel
      const [hookModel, seoModel] = await Promise.all([
        this.trackedModel("claude-sonnet-5", "publish_hook"),
        this.trackedModel("claude-haiku-4-5-20251001", "publish_seo"),
      ]);
      const [hookResult, seoResult] = await Promise.allSettled([
        createHook(hookModel, draftInput),
        createSeoMeta(seoModel, draftInput),
      ]);

      const hook = hookResult.status === "fulfilled" ? hookResult.value : "";
      const { excerpt, tags } =
        seoResult.status === "fulfilled"
          ? seoResult.value
          : { excerpt: "", tags: "" };

      if (hookResult.status === "rejected") {
        logger("web").error("handleGenerateSeo hook generation failed", { component: "writer-agent", error: hookResult.reason instanceof Error ? hookResult.reason.message : String(hookResult.reason) });
      }
      if (seoResult.status === "rejected") {
        logger("web").error("handleGenerateSeo SEO meta generation failed", { component: "writer-agent", error: seoResult.reason instanceof Error ? seoResult.reason.message : String(seoResult.reason) });
      }

      return Response.json({ hook, excerpt, tags });
    } catch (error) {
      logger("web").error("handleGenerateSeo failed", { component: "writer-agent", error: error instanceof Error ? error.message : String(error) });
      return Response.json(
        { error: "Failed to generate SEO metadata" },
        { status: 500 },
      );
    }
  }

  async handleGenerateTweet(request: Request): Promise<Response> {
    const draft = this.getCurrentDraft();
    if (!draft) {
      return Response.json({ error: "No draft exists." }, { status: 400 });
    }

    let hook: string | undefined;
    try {
      const body = (await request.json()) as { hook?: string };
      hook = body.hook?.trim() || undefined;
    } catch {
      // Body is optional — no hook provided
    }

    const draftInput: DraftInput = {
      title: draft.title,
      content: draft.content,
    };

    try {
      const tweetModel = await this.trackedModel("claude-haiku-4-5-20251001", "publish_tweet");
      const tweet = await createTweet(tweetModel, draftInput, hook);
      return Response.json({ tweet });
    } catch (error) {
      logger("web").error("handleGenerateTweet failed", { component: "writer-agent", error: error instanceof Error ? error.message : String(error) });
      return Response.json(
        { error: "Failed to generate tweet" },
        { status: 500 },
      );
    }
  }

  async handleGenerateLinkedInPost(request: Request): Promise<Response> {
    const draft = this.getCurrentDraft();
    if (!draft) {
      return Response.json({ error: "No draft exists." }, { status: 400 });
    }

    let body: { mode?: string; hook?: string; currentText?: string } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      // Body is optional
    }

    const mode = body.mode === "text" ? ("text" as const) : ("link" as const);
    const draftInput: DraftInput = {
      title: draft.title,
      content: draft.content,
    };

    try {
      const linkedInModel = await this.trackedModel("claude-haiku-4-5-20251001", "publish_linkedin");
      const linkedInPost = await optimizeForLinkedIn(linkedInModel, draftInput, {
        mode,
        hook: body.hook?.trim() || undefined,
        currentText: body.currentText?.trim() || undefined,
      });
      return Response.json({ linkedInPost });
    } catch (error) {
      logger("web").error("handleGenerateLinkedInPost failed", { component: "writer-agent", error: error instanceof Error ? error.message : String(error) });
      return Response.json(
        { error: "Failed to generate LinkedIn post" },
        { status: 500 },
      );
    }
  }

  async handlePublishToCms(request: Request): Promise<Response> {
    if (this.state.writingPhase === "publishing") {
      return Response.json(
        { error: "A publish operation is already in progress." },
        { status: 429 },
      );
    }

    let body: {
      slug: string;
      author?: string;
      tags?: string;
      excerpt?: string;
      hook?: string;
      publicationId?: string;
      draftVersion?: number;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json(
        { error: "Invalid JSON in request body" },
        { status: 400 },
      );
    }

    const slug = body.slug?.trim();
    if (!slug) {
      return Response.json({ error: "slug is required" }, { status: 400 });
    }

    const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugPattern.test(slug)) {
      return Response.json(
        {
          error:
            "Slug must contain only lowercase letters, numbers, and hyphens",
        },
        { status: 400 },
      );
    }

    // Validate draftVersion if provided
    if (body.draftVersion !== undefined && (!Number.isInteger(body.draftVersion) || body.draftVersion < 1)) {
      return Response.json(
        { error: "draftVersion must be a positive integer" },
        { status: 400 },
      );
    }

    // Resolve which draft to publish
    const draft = body.draftVersion
      ? this.getDraftByVersion(body.draftVersion)
      : this.getCurrentDraft();
    if (!draft) {
      return Response.json(
        { error: body.draftVersion ? `Draft version ${body.draftVersion} not found.` : "No draft exists to publish." },
        { status: 400 },
      );
    }

    const pubId = body.publicationId || this.state.publicationId;
    if (!pubId) {
      return Response.json(
        { error: "No publication selected" },
        { status: 400 },
      );
    }

    this.setWritingPhase("publishing");

    try {
      const pub = await this.env.DAL.getPublicationById(pubId);
      if (!pub || pub.userId !== this.state.userId) {
        this.setWritingPhase("revising");
        return Response.json(
          { error: "Publication not found" },
          { status: 404 },
        );
      }

      let parsedCitations: Citation[] | undefined;
      try {
        parsedCitations = draft.citations
          ? (JSON.parse(draft.citations) as Citation[])
          : undefined;
      } catch {
        logger("web").warn("Invalid citations JSON, skipping", { component: "writer-agent", draftVersion: draft.version });
        parsedCitations = undefined;
      }

      const hook = body.hook?.trim() || undefined;
      const htmlContent = await marked.parse(draft.content);
      const cmsApi = await getCmsClient(pub, this.env.DAL, this.env);
      const cmsPublicationId = await resolveCmsPublicationId(pub, cmsApi, this.env.DAL);

      const isUpdate = !!this.state.cmsPostId;
      let post;

      if (isUpdate) {
        // Update existing post in CMS
        post = await cmsApi.updatePost(this.state.cmsPostId!, {
          title: draft.title || "Untitled",
          slug,
          content: htmlContent,
          markdown: draft.content,
          author: body.author?.trim() || pub.defaultAuthor,
          tags: body.tags?.trim() || undefined,
          excerpt: body.excerpt?.trim() || undefined,
          hook,
          citations: parsedCitations,
          featuredImage: this.state.featuredImageUrl || undefined,
        });
      } else {
        // Create new post in CMS
        post = await cmsApi.createPost({
          title: draft.title || "Untitled",
          slug,
          content: htmlContent,
          markdown: draft.content,
          status: "published",
          author: body.author?.trim() || pub.defaultAuthor,
          tags: body.tags?.trim() || undefined,
          excerpt: body.excerpt?.trim() || undefined,
          hook,
          citations: parsedCitations,
          featuredImage: this.state.featuredImageUrl || undefined,
          publishedAt: new Date().toISOString(),
          publicationId: cmsPublicationId,
        });
      }

      this.finalizeDraft(post.id, draft.version);

      return Response.json({
        success: true,
        results: [
          {
            postId: post.id,
            slug: post.slug,
            title: post.title,
            publicationId: pubId,
          },
        ],
      });
    } catch (err) {
      this.setWritingPhase("revising");
      const message = err instanceof Error ? err.message : "Unknown CMS error";
      return Response.json(
        { error: `Failed to publish: ${message}` },
        { status: 502 },
      );
    }
  }

  // --- Draft management methods (called by tools) ---

  getEnv(): Env {
    return this.env;
  }

  saveDraft(
    title: string | null,
    content: string,
    citations: string | null,
    feedback: string | null,
  ): DraftRow {
    const version = this.state.currentDraftVersion + 1;
    const id = crypto.randomUUID();
    const wordCount = content.split(/\s+/).filter(Boolean).length;

    this
      .sql`INSERT INTO drafts (id, version, title, content, citations, word_count, feedback)
      VALUES (${id}, ${version}, ${title}, ${content}, ${citations}, ${wordCount}, ${feedback})`;

    this.setState({
      ...this.state,
      currentDraftVersion: version,
      title: title ?? this.state.title,
      writingPhase: "revising",
    });

    return {
      id,
      version,
      title,
      content,
      citations,
      word_count: wordCount,
      is_final: 0,
      feedback,
      created_at: Math.floor(Date.now() / 1000),
    };
  }

  getCurrentDraft(): DraftRow | null {
    const rows = this
      .sql<DraftRow>`SELECT * FROM drafts ORDER BY version DESC LIMIT 1`;
    return rows.length > 0 ? rows[0] : null;
  }

  updateDraft(content: string, title?: string, version?: number): DraftRow | null {
    const draft = version
      ? this.getDraftByVersion(version)
      : this.getCurrentDraft();
    if (!draft) return null;

    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const newTitle = title !== undefined ? title : draft.title;

    this
      .sql`UPDATE drafts SET content = ${content}, title = ${newTitle}, word_count = ${wordCount} WHERE version = ${draft.version}`;

    return { ...draft, content, title: newTitle, word_count: wordCount };
  }

  getDraftByVersion(version: number): DraftRow | null {
    const rows = this
      .sql<DraftRow>`SELECT * FROM drafts WHERE version = ${version}`;
    return rows.length > 0 ? rows[0] : null;
  }

  listDrafts(): DraftSummary[] {
    return this
      .sql<DraftSummary>`SELECT id, version, title, word_count, is_final, created_at FROM drafts ORDER BY version ASC`;
  }

  finalizeDraft(cmsPostId: string, publishedVersion?: number): void {
    const version = publishedVersion ?? this.getCurrentDraft()?.version;
    if (!version) return;

    // Mark published version as final
    this.sql`UPDATE drafts SET is_final = 1 WHERE version = ${version}`;

    // Delete drafts after the published version (user chose an older draft)
    this.sql`DELETE FROM drafts WHERE version > ${version}`;

    // Clean up intermediate drafts (keep v1 + final)
    if (version > 1) {
      this
        .sql`DELETE FROM drafts WHERE version > 1 AND version < ${version}`;
    }

    this.setState({
      ...this.state,
      writingPhase: "published",
      cmsPostId,
      currentDraftVersion: version,
    });
  }

  setWritingPhase(phase: WritingPhase): void {
    this.setState({
      ...this.state,
      writingPhase: phase,
    });
  }

  // --- HTTP handlers for draft queries ---

  private handleListDrafts(): Response {
    const drafts = this.listDrafts();
    return Response.json({ data: drafts });
  }

  private handleGetDraft(version: number): Response {
    const rows = this
      .sql<DraftRow>`SELECT * FROM drafts WHERE version = ${version}`;
    if (rows.length === 0) {
      return Response.json({ error: "Draft not found" }, { status: 404 });
    }
    return Response.json(rows[0]);
  }

  private async handleUpdateDraft(request: Request): Promise<Response> {
    let body: { content?: unknown; title?: unknown; version?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (typeof body.content !== "string" || !body.content.trim()) {
      return Response.json(
        { error: "content is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    if (body.content.length > 512 * 1024) {
      return Response.json(
        { error: "Content exceeds maximum allowed size" },
        { status: 413 },
      );
    }

    if (body.title !== undefined && typeof body.title !== "string") {
      return Response.json(
        { error: "title must be a string" },
        { status: 400 },
      );
    }

    const version = typeof body.version === "number" ? body.version : undefined;
    if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
      return Response.json(
        { error: "version must be a positive integer" },
        { status: 400 },
      );
    }

    const updated = this.updateDraft(
      body.content,
      body.title as string | undefined,
      version,
    );
    if (!updated) {
      return Response.json({ error: "Draft not found" }, { status: 404 });
    }

    return Response.json(updated);
  }

  /** Seed the agent with an existing post's content as draft v1. Used when editing a published post. */
  private async handleSeedDraft(request: Request): Promise<Response> {
    if (this.state.currentDraftVersion > 0) {
      return Response.json(
        { error: "Draft already seeded for this session" },
        { status: 409 },
      );
    }

    let body: { title?: string; content?: string; citations?: string | null };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (typeof body.content !== "string" || !body.content.trim()) {
      return Response.json(
        { error: "content is required" },
        { status: 400 },
      );
    }

    // saveDraft handles setState (sets currentDraftVersion, writingPhase, title)
    const draft = this.saveDraft(
      body.title || null,
      body.content,
      body.citations ?? null,
      null,
    );

    return Response.json({ success: true, version: draft.version });
  }
}
