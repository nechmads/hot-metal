# Content Scout — Detailed Implementation Plan

## Overview

The Content Scout is a Cloudflare Worker (`services/content-scout`) that runs on a daily cron schedule. It discovers relevant news and stories using the **Alexander API**, generates blog post ideas using **Claude Sonnet 4.5** via **Vercel AI SDK V6**, and optionally triggers the writer-agent to auto-write and publish posts.

This document covers the full implementation details. For the broader automation architecture, see [blog-automation.md](blog-automation.md).

---

## Architecture

```
  CF Cron (0 7 * * *)
         |
         v
  Scout Worker (scheduled handler)
         |
         | Query D1: which publications need a run?
         |
         v
  CF Queue (hotmetal-scout-queue)
         |  1 message per publication
         v
  Queue Consumer (same worker)
         |
         v
  CF Workflow (ScoutWorkflow) — one instance per publication
         |
    +----|----+---------+---------+---------+----------+
    |         |         |         |         |          |
  Step 1    Step 2    Step 3    Step 4    Step 5    Step 6
  Load      Search    Dedupe    Generate  Store     Auto-write
  Context   (Alexander Stories   Ideas    Ideas     (conditional)
            + KV      (LLM)    (LLM)    (D1)
            cache)
```

### Why Queue + Workflow?

**Queue (fan-out):** A single cron invocation can't reliably process 100 publications sequentially — it risks timeouts and one failure blocking others. The queue provides:

- Isolated processing per publication (one failure doesn't affect others)
- Automatic retry with dead-letter queue for persistent failures
- Concurrency control (max_concurrency setting)
- Backpressure when Alexander API or LLM rate limits are hit

**Workflow (step durability):** The scout pipeline has distinct steps with expensive external calls. If the LLM call in step 4 fails after Alexander searches in step 2 succeeded, we don't want to re-run the searches. CF Workflows persist each step's output — on retry, it resumes from the failed step.

### Service Boundaries

- **Content Scout** owns: discovery, idea generation, auto-write orchestration
- **Writer Agent** owns: writing sessions, drafts, CMS publishing
- **Alexander API** owns: web search, news search, research, Q&A
- **Shared:** WRITER_DB (D1), `@hotmetal/shared` package (AlexanderApi client, types)

---

## Cloudflare Resources

| Resource     | Name                     | Purpose                                      |
| ------------ | ------------------------ | -------------------------------------------- |
| Worker       | `hotmetal-content-scout` | Cron handler, queue consumer, workflow host  |
| Queue        | `hotmetal-scout-queue`   | Fan-out: 1 message per publication           |
| Queue (DLQ)  | `hotmetal-scout-dlq`     | Dead-letter queue for failed publications    |
| KV Namespace | `hotmetal-scout-cache`   | Cache Alexander API search results (24h TTL) |
| Workflow     | `scout-workflow`         | Durable multi-step pipeline per publication  |
| D1 (shared)  | `hotmetal-writer-db`     | Publications, topics, ideas, sessions        |

---

## Environment & Configuration

### `wrangler.jsonc`

```jsonc
{
  "name": "hotmetal-content-scout",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-01",
  "compatibility_flags": ["nodejs_compat"],

  "triggers": {
    "crons": ["0 7 * * *"],
  },

  "workflows": [
    {
      "name": "scout-workflow",
      "binding": "SCOUT_WORKFLOW",
      "class_name": "ScoutWorkflow",
    },
  ],

  "queues": {
    "producers": [
      {
        "queue": "hotmetal-scout-queue",
        "binding": "SCOUT_QUEUE",
      },
    ],
    "consumers": [
      {
        "queue": "hotmetal-scout-queue",
        "max_batch_size": 1,
        "max_retries": 3,
        "dead_letter_queue": "hotmetal-scout-dlq",
      },
    ],
  },

  "kv_namespaces": [
    {
      "binding": "SCOUT_CACHE",
      "id": "<kv-namespace-id>",
    },
  ],

  "d1_databases": [
    {
      "binding": "WRITER_DB",
      "database_name": "hotmetal-writer-db",
      "database_id": "<same as writer-agent>",
    },
  ],

  "vars": {
    "ALEXANDER_API_URL": "https://alexanderai.farfarawaylabs.com",
    "WRITER_AGENT_URL": "https://hotmetal-writer-agent.<account>.workers.dev",
  },
}
```

### Environment Types

```typescript
// src/env.ts
import type { Workflow } from "cloudflare:workers";

export interface Env {
  // Bindings
  WRITER_DB: D1Database;
  SCOUT_QUEUE: Queue<ScoutQueueMessage>;
  SCOUT_WORKFLOW: Workflow<ScoutWorkflowParams>;
  SCOUT_CACHE: KVNamespace;

  // Vars & Secrets
  ALEXANDER_API_URL: string;
  ALEXANDER_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  WRITER_AGENT_URL: string;
  WRITER_AGENT_API_KEY: string;
}

export interface ScoutQueueMessage {
  publicationId: string;
  triggeredBy: "cron" | "manual";
}

export interface ScoutWorkflowParams {
  publicationId: string;
  triggeredBy: "cron" | "manual";
}
```

### Dependencies

```json
{
  "dependencies": {
    "ai": "^6.0.0",
    "@ai-sdk/anthropic": "^2.0.0",
    "@hotmetal/shared": "workspace:*",
    "hono": "^4.0.0"
  }
}
```

---

## Cron Handler & Queue

### Entry Point

```typescript
// src/index.ts
import { Hono } from "hono";
import type { Env, ScoutQueueMessage } from "./env";
import { ScoutWorkflow } from "./workflow";

const app = new Hono<{ Bindings: Env }>();

// Manual trigger: run scout for a single publication
app.post("/api/scout/run", async (c) => {
  const { publicationId } = await c.req.json<{ publicationId: string }>();
  await c.env.SCOUT_QUEUE.send({ publicationId, triggeredBy: "manual" });
  return c.json({ queued: true, publicationId });
});

// Manual trigger: run scout for all publications
app.post("/api/scout/run-all", async (c) => {
  const count = await enqueueAllPublications(c.env, "manual");
  return c.json({ queued: true, count });
});

export { ScoutWorkflow };

export default {
  fetch: app.fetch,

  // Cron trigger — fan out to queue
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(enqueueAllPublications(env, "cron"));
  },

  // Queue consumer — start a workflow per publication
  async queue(batch: MessageBatch<ScoutQueueMessage>, env: Env) {
    for (const message of batch.messages) {
      const { publicationId, triggeredBy } = message.body;

      try {
        await env.SCOUT_WORKFLOW.create({
          id: `scout-${publicationId}-${Date.now()}`,
          params: { publicationId, triggeredBy },
        });
        message.ack();
      } catch (err) {
        console.error(
          `Failed to start workflow for publication ${publicationId}:`,
          err,
        );
        message.retry();
      }
    }
  },
};
```

### Enqueue All Publications

Queries D1 for publications that should run today, then enqueues one message per publication.

```typescript
async function enqueueAllPublications(
  env: Env,
  triggeredBy: "cron" | "manual",
): Promise<number> {
  const publications = await env.WRITER_DB.prepare(
    "SELECT id, auto_publish_mode, cadence_posts_per_week FROM publications",
  ).all<{
    id: string;
    auto_publish_mode: string;
    cadence_posts_per_week: number;
  }>();

  let count = 0;
  for (const pub of publications.results ?? []) {
    // For 'draft' and 'publish' mode: run every day (ideas are always useful)
    // For 'full-auto': also run every day (cadence check happens at auto-write step)
    await env.SCOUT_QUEUE.send({ publicationId: pub.id, triggeredBy });
    count++;
  }

  return count;
}
```

**Why run every publication every day:** Even in `draft` mode, users benefit from daily idea generation. The cadence check (posts per week) only gates the auto-write step, not discovery.

---

## Workflow: ScoutWorkflow

The workflow is the core of the scout. Each instance processes one publication through 6 durable steps.

```typescript
// src/workflow.ts
import {
  WorkflowEntrypoint,
  WorkflowEvent,
  WorkflowStep,
} from "cloudflare:workers";
import type { Env, ScoutWorkflowParams } from "./env";
import { loadPublicationContext } from "./steps/load-context";
import { searchForContent } from "./steps/search";
import { dedupeStories } from "./steps/dedupe";
import { generateIdeas } from "./steps/generate-ideas";
import { storeIdeas } from "./steps/store-ideas";
import { autoWriteTopIdea } from "./steps/auto-write";

export class ScoutWorkflow extends WorkflowEntrypoint<
  Env,
  ScoutWorkflowParams
> {
  async run(event: WorkflowEvent<ScoutWorkflowParams>, step: WorkflowStep) {
    const { publicationId } = event.payload;

    // Step 1: Load publication context from D1
    const context = await step.do("load-context", async () => {
      return await loadPublicationContext(this.env.WRITER_DB, publicationId);
    });

    if (context.topics.length === 0) {
      return { publicationId, ideasGenerated: 0, skipped: "no active topics" };
    }

    // Step 2: Search for content via Alexander API (with KV cache)
    const searchResults = await step.do(
      "search-content",
      {
        retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
        timeout: "2 minutes",
      },
      async () => {
        return await searchForContent(
          this.env.ALEXANDER_API_URL,
          this.env.ALEXANDER_API_KEY,
          this.env.SCOUT_CACHE,
          context.topics,
          context.publication.description,
        );
      },
    );

    // Step 3: Dedupe stories against recent ideas (LLM call)
    const filteredStories = await step.do(
      "dedupe-stories",
      {
        retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
        timeout: "1 minute",
      },
      async () => {
        return await dedupeStories(
          this.env.ANTHROPIC_API_KEY,
          searchResults,
          context.recentIdeas,
        );
      },
    );

    if (filteredStories.length === 0) {
      return {
        publicationId,
        ideasGenerated: 0,
        skipped: "no new stories after dedup",
      };
    }

    // Step 4: Generate idea briefs from filtered stories (LLM call)
    const ideas = await step.do(
      "generate-ideas",
      {
        retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
        timeout: "2 minutes",
      },
      async () => {
        return await generateIdeas(
          this.env.ANTHROPIC_API_KEY,
          context.publication,
          filteredStories,
          context.topics,
        );
      },
    );

    if (ideas.length === 0) {
      return {
        publicationId,
        ideasGenerated: 0,
        skipped: "LLM produced no ideas",
      };
    }

    // Step 5: Store ideas in D1
    await step.do("store-ideas", async () => {
      return await storeIdeas(
        this.env.WRITER_DB,
        publicationId,
        ideas,
        context.topics,
      );
    });

    // Step 6: Auto-write (conditional — only for publish/full-auto modes)
    let autoWritten = 0;
    if (context.publication.auto_publish_mode !== "draft") {
      autoWritten = await step.do(
        "auto-write",
        { retries: { limit: 1, delay: "10 seconds" }, timeout: "10 minutes" },
        async () => {
          return await autoWriteTopIdea(this.env, context.publication, ideas);
        },
      );
    }

    return {
      publicationId,
      publicationName: context.publication.name,
      ideasGenerated: ideas.length,
      autoWritten,
    };
  }
}
```

---

## Step 1: Load Publication Context

```typescript
// src/steps/load-context.ts

export interface PublicationContext {
  publication: Publication;
  topics: Topic[];
  recentIdeas: RecentIdea[];
}

export async function loadPublicationContext(
  db: D1Database,
  publicationId: string,
): Promise<PublicationContext> {
  // Load publication config
  const publication = await db
    .prepare("SELECT * FROM publications WHERE id = ?")
    .bind(publicationId)
    .first<Publication>();

  if (!publication) throw new Error(`Publication ${publicationId} not found`);

  // Load active topics
  const { results: topics } = await db
    .prepare(
      "SELECT * FROM topics WHERE publication_id = ? AND is_active = 1 ORDER BY priority DESC",
    )
    .bind(publicationId)
    .all<Topic>();

  // Load recent ideas (last 7 days) for dedup context
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const { results: recentIdeas } = await db
    .prepare(
      "SELECT id, title, angle FROM ideas WHERE publication_id = ? AND created_at >= ?",
    )
    .bind(publicationId, sevenDaysAgo)
    .all<RecentIdea>();

  return { publication, topics: topics ?? [], recentIdeas: recentIdeas ?? [] };
}
```

---

## Step 2: Search for Content (with KV Cache)

For each active topic, we make **two Alexander API calls** (`searchNews` + `search`). Results are cached in KV so that overlapping queries across publications don't hit the API twice.

```typescript
// src/steps/search.ts
import { AlexanderApi } from "@hotmetal/shared";

const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export async function searchForContent(
  alexanderUrl: string,
  alexanderKey: string,
  cache: KVNamespace,
  topics: Topic[],
  publicationDescription: string | null,
): Promise<TopicSearchResults[]> {
  const alexander = new AlexanderApi(alexanderUrl, alexanderKey);

  const results = await Promise.all(
    topics.map(async (topic) => {
      const searchQuery = `${topic.name} ${topic.description || ""}`;

      // Search news (cached)
      const news = await cachedSearch(cache, `news:${searchQuery}`, () =>
        alexander.searchNews({
          query: searchQuery,
          max_results: 5,
          recency: "day",
        }),
      );

      // Search web (cached)
      const web = await cachedSearch(cache, `web:${searchQuery}`, () =>
        alexander.search({
          query: searchQuery,
          maxResults: 5,
          recency: "week",
        }),
      );

      return {
        topicName: topic.name,
        topicDescription: topic.description,
        topicPriority: topic.priority,
        news: news?.results ?? [],
        web: web?.results ?? [],
      };
    }),
  );

  return results;
}

async function cachedSearch<T>(
  cache: KVNamespace,
  key: string,
  fetcher: () => Promise<T>,
): Promise<T | null> {
  // Check cache
  const cacheKey = `search:${hashQuery(key)}`;
  const cached = await cache.get(cacheKey, "json");
  if (cached) return cached as T;

  // Fetch from Alexander
  try {
    const result = await fetcher();
    // Store in cache
    await cache.put(cacheKey, JSON.stringify(result), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
    return result;
  } catch (err) {
    console.error(`Search failed for "${key}":`, err);
    return null;
  }
}

function hashQuery(query: string): string {
  // Simple hash for cache keys — normalize whitespace and case
  return query.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 200);
}
```

**Why KV cache instead of in-memory:** Different workflow instances (for different publications) run independently. KV cache is shared across all of them, so when publication A searches for "AI" and publication B also searches for "AI" 30 seconds later, B gets a cache hit.

**Cache key design:** `search:{endpoint}:{normalized-query}`. The 24h TTL matches the daily cron cadence — results are fresh each day, but shared within a single day's run.

---

## Step 3: Dedupe Stories (LLM Call)

This is a **separate LLM call** before idea generation. Its job: compare new search results against recent ideas and filter out stories that cover ground we've already covered.

```typescript
// src/steps/dedupe.ts
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

export async function dedupeStories(
  apiKey: string,
  searchResults: TopicSearchResults[],
  recentIdeas: RecentIdea[],
): Promise<FilteredStory[]> {
  // If no recent ideas, skip dedup — everything is new
  if (recentIdeas.length === 0) {
    return flattenToStories(searchResults);
  }

  const anthropic = createAnthropic({ apiKey });

  const result = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    system: DEDUPE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildDedupeUserPrompt(searchResults, recentIdeas),
      },
    ],
  });

  return parseFilteredStories(result.text, searchResults);
}
```

### Dedupe System Prompt

```typescript
const DEDUPE_SYSTEM_PROMPT = `You are a news story deduplication assistant.

You will receive:
1. A list of recent news stories and articles organized by topic
2. A list of blog post ideas that were already generated in the past 7 days

Your task: Identify which news stories cover the SAME underlying story or event as an existing idea. Two items cover the "same story" if they're about the same event, announcement, product launch, controversy, or trend — even if the specific articles are different.

For each news story, respond with:
- "keep" if it covers a genuinely NEW story not represented in the recent ideas
- "drop" if it covers the same underlying story as one of the recent ideas

IMPORTANT: Respond with valid JSON only. Use this exact format:
{
  "decisions": [
    { "index": 0, "verdict": "keep", "reason": "New story about X not in recent ideas" },
    { "index": 1, "verdict": "drop", "reason": "Same story as idea 'Title Y' — both about Z" }
  ]
}`;
```

### Dedupe User Prompt

```typescript
function buildDedupeUserPrompt(
  searchResults: TopicSearchResults[],
  recentIdeas: RecentIdea[],
): string {
  let prompt = "## Recent News Stories\n\n";

  let index = 0;
  for (const { topicName, news, web } of searchResults) {
    const allStories = [...news, ...web];
    for (const story of allStories) {
      prompt += `[${index}] Topic: ${topicName} | "${story.title}"\n`;
      prompt += `    ${story.snippet}\n\n`;
      index++;
    }
  }

  prompt += "## Already-Covered Ideas (past 7 days)\n\n";
  for (const idea of recentIdeas) {
    prompt += `- **${idea.title}** — ${idea.angle}\n`;
  }

  prompt += "\n---\nFor each numbered story above, respond with keep or drop.";

  return prompt;
}
```

**Why a separate LLM call:** The dedup task (comparison/filtering) is fundamentally different from the idea generation task (creative synthesis). Keeping them separate means:

- Each step is focused and debuggable
- Dedup output is persisted by the workflow — if idea generation fails, we don't re-run dedup
- We could use a cheaper/faster model for dedup in the future (e.g., Haiku) since it's a simpler task
- The idea generation prompt is cleaner — it only sees pre-filtered, relevant stories

---

## Step 4: Generate Idea Briefs (LLM Call)

After dedup, we pass the **filtered stories** to the idea generation LLM. This prompt does NOT include recent ideas for dedup (that was already handled) — it focuses purely on creative idea generation.

```typescript
// src/steps/generate-ideas.ts
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

export async function generateIdeas(
  apiKey: string,
  publication: Publication,
  filteredStories: FilteredStory[],
  topics: Topic[],
): Promise<IdeaBrief[]> {
  const anthropic = createAnthropic({ apiKey });

  const result = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    system: buildIdeaSystemPrompt(publication),
    messages: [
      {
        role: "user",
        content: buildIdeaUserPrompt(filteredStories, topics),
      },
    ],
  });

  return parseIdeaBriefs(result.text);
}
```

### Idea Generation System Prompt

```typescript
function buildIdeaSystemPrompt(publication: Publication): string {
  return `You are a content scout for a publication called "${publication.name}".

Publication description: ${publication.description || "No description provided."}

Your job is to analyze the provided news stories and articles, then generate blog post ideas that would resonate with this publication's audience.

For each idea, provide:
1. **title** — A compelling, specific blog post title
2. **angle** — The editorial angle or thesis (1-2 sentences). What makes this take unique?
3. **summary** — A 2-3 paragraph brief explaining what the post would cover, key arguments, and why readers would care
4. **topic** — Which topic this relates to (use the exact topic name)
5. **relevance_score** — A score from 0.0 to 1.0 indicating how relevant and timely this idea is
6. **sources** — The specific articles/news items that inspired this idea (include URLs)

Guidelines:
- Generate 3-5 ideas, ranked by relevance score (highest first)
- Prefer unique angles over obvious takes — what can this publication say that others can't?
- Focus on timeliness — breaking news and emerging trends score higher
- Each idea should be distinct — don't generate variations of the same story
- If a story is already well-covered elsewhere, find an underexplored angle

IMPORTANT: Respond with valid JSON only. Use this exact format:
{
  "ideas": [
    {
      "title": "...",
      "angle": "...",
      "summary": "...",
      "topic": "...",
      "relevance_score": 0.85,
      "sources": [
        { "url": "...", "title": "...", "snippet": "..." }
      ]
    }
  ]
}`;
}
```

### Idea User Prompt

```typescript
function buildIdeaUserPrompt(
  filteredStories: FilteredStory[],
  topics: Topic[],
): string {
  let prompt = "## Topics of Interest\n\n";

  for (const topic of topics) {
    prompt += `- **${topic.name}**`;
    if (topic.description) prompt += ` — ${topic.description}`;
    prompt += ` (Priority: ${topic.priority === 3 ? "URGENT" : topic.priority === 2 ? "High" : "Normal"})\n`;
  }

  prompt += "\n## Relevant Stories\n\n";

  for (const story of filteredStories) {
    prompt += `### ${story.title}\n`;
    prompt += `Topic: ${story.topicName}\n`;
    if (story.url) prompt += `URL: ${story.url}\n`;
    if (story.date) prompt += `Date: ${story.date}\n`;
    prompt += `${story.snippet}\n\n`;
  }

  prompt +=
    "---\n\nBased on these stories, generate blog post ideas for this publication.";

  return prompt;
}
```

### Parsing

```typescript
function parseIdeaBriefs(text: string): IdeaBrief[] {
  // Extract JSON from the response (handle potential markdown code fences)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.ideas || [];
  } catch {
    console.error("Failed to parse idea briefs JSON");
    return [];
  }
}
```

---

## Step 5: Store Ideas

```typescript
// src/steps/store-ideas.ts

export async function storeIdeas(
  db: D1Database,
  publicationId: string,
  ideas: IdeaBrief[],
  topics: Topic[],
): Promise<number> {
  const topicsByName = new Map(topics.map((t) => [t.name, t]));

  for (const idea of ideas) {
    const topicId = topicsByName.get(idea.topic)?.id ?? null;

    await db
      .prepare(
        `INSERT INTO ideas (id, publication_id, topic_id, title, angle, summary, sources, relevance_score, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
      )
      .bind(
        crypto.randomUUID(),
        publicationId,
        topicId,
        idea.title,
        idea.angle,
        idea.summary,
        JSON.stringify(idea.sources),
        idea.relevance_score,
      )
      .run();
  }

  return ideas.length;
}
```

---

## Step 6: Auto-Write (Conditional)

Only runs for publications with `auto_publish_mode` = `publish` or `full-auto`. Picks the highest-scoring idea and triggers the writer-agent to write and publish it.

### Cadence Check

```typescript
// src/steps/auto-write.ts

export async function autoWriteTopIdea(
  env: Env,
  publication: Publication,
  ideas: IdeaBrief[],
): Promise<number> {
  // Check if we should auto-write
  if (publication.auto_publish_mode === "draft") return 0;

  if (publication.auto_publish_mode === "full-auto") {
    const shouldWrite = await checkCadence(env.WRITER_DB, publication);
    if (!shouldWrite) return 0;
  }

  // Pick the highest-scoring idea
  const topIdea = ideas.reduce((best, idea) =>
    idea.relevance_score > best.relevance_score ? idea : best,
  );

  // Fetch the stored idea (to get its DB id)
  const storedIdea = await env.WRITER_DB.prepare(
    "SELECT * FROM ideas WHERE publication_id = ? AND title = ? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(publication.id, topIdea.title)
    .first<Idea>();

  if (!storedIdea) return 0;

  await writeAndPublish(env, publication, storedIdea);
  return 1;
}

async function checkCadence(
  db: D1Database,
  publication: Publication,
): Promise<boolean> {
  const weekStart = getWeekStartTimestamp();
  const result = await db
    .prepare(
      `SELECT COUNT(*) as count FROM sessions
       WHERE publication_id = ? AND status = 'completed' AND updated_at >= ?`,
    )
    .bind(publication.id, weekStart)
    .first<{ count: number }>();

  return (result?.count ?? 0) < publication.cadence_posts_per_week;
}
```

### Write & Publish Flow

```typescript
async function writeAndPublish(
  env: Env,
  publication: Publication,
  idea: Idea,
): Promise<void> {
  const baseUrl = env.WRITER_AGENT_URL;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.WRITER_AGENT_API_KEY}`,
  };

  // 1. Create a writing session with seed context
  const seedContext = buildSeedContext(idea, publication);
  const sessionRes = await fetch(`${baseUrl}/api/sessions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      userId: "default",
      title: idea.title,
      publicationId: publication.id,
      ideaId: idea.id,
      seedContext,
    }),
  });
  if (!sessionRes.ok)
    throw new Error(`Failed to create session: ${await sessionRes.text()}`);
  const session = (await sessionRes.json()) as { id: string };

  // 2. Send a write instruction to the agent
  const chatRes = await fetch(`${baseUrl}/api/sessions/${session.id}/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message: buildWriteInstruction(idea, publication) }),
  });
  if (!chatRes.ok)
    throw new Error(
      `Chat failed for session ${session.id}: ${await chatRes.text()}`,
    );

  // 3. Wait for draft to be produced (poll)
  const draft = await pollForDraft(
    baseUrl,
    env.WRITER_AGENT_API_KEY,
    session.id,
  );
  if (!draft)
    throw new Error(
      `No draft produced for session ${session.id} within timeout`,
    );

  // 4. Publish the draft
  const publishRes = await fetch(
    `${baseUrl}/api/sessions/${session.id}/publish`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        slug: slugify(idea.title),
        author: publication.default_author,
      }),
    },
  );
  if (!publishRes.ok)
    throw new Error(`Publish failed: ${await publishRes.text()}`);

  // 5. Update idea status
  await env.WRITER_DB.prepare(
    "UPDATE ideas SET status = 'promoted', session_id = ?, updated_at = unixepoch() WHERE id = ?",
  )
    .bind(session.id, idea.id)
    .run();
}
```

### Seed Context & Write Instruction

```typescript
function buildSeedContext(idea: Idea, publication: Publication): string {
  let context = `## Writing Assignment\n\n`;
  context += `**Title:** ${idea.title}\n`;
  context += `**Angle:** ${idea.angle}\n\n`;
  context += `**Brief:**\n${idea.summary}\n\n`;

  if (publication.writing_tone) {
    context += `**Writing Tone:** ${publication.writing_tone}\n\n`;
  }

  if (idea.sources) {
    const sources = JSON.parse(idea.sources) as Array<{
      url: string;
      title: string;
      snippet: string;
    }>;
    context += `## Source Material\n\n`;
    for (const source of sources) {
      context += `### ${source.title}\nURL: ${source.url}\n${source.snippet}\n\n`;
    }
  }

  return context;
}

function buildWriteInstruction(idea: Idea, publication: Publication): string {
  let instruction = `Please write a complete blog post based on the research context provided. `;
  instruction += `The post should be titled "${idea.title}" and take the following angle: ${idea.angle}\n\n`;
  instruction += `Key points to cover:\n${idea.summary}\n\n`;

  if (publication.writing_tone) {
    instruction += `Writing style: ${publication.writing_tone}\n\n`;
  }

  instruction += `Please research the topic using the available tools, then write a thorough, well-sourced blog post. `;
  instruction += `Include citations where appropriate. The post should be ready for publication.`;

  return instruction;
}
```

### Draft Polling

```typescript
async function pollForDraft(
  baseUrl: string,
  apiKey: string,
  sessionId: string,
  maxAttempts = 30,
  intervalMs = 10_000,
): Promise<{ version: number } | null> {
  const headers = { Authorization: `Bearer ${apiKey}` };

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    const res = await fetch(`${baseUrl}/api/sessions/${sessionId}/drafts`, {
      headers,
    });
    if (!res.ok) continue;

    const { data: drafts } = (await res.json()) as {
      data: Array<{ version: number; is_final: number }>;
    };

    const finalDraft = drafts.find((d) => d.is_final);
    if (finalDraft) return finalDraft;

    if (drafts.length > 0) return drafts[drafts.length - 1];
  }

  return null;
}
```

---

## File Structure

```
services/content-scout/
  src/
    index.ts                — Hono app + cron + queue consumer entry point
    env.ts                  — Environment type definitions
    workflow.ts             — ScoutWorkflow class (orchestrates all steps)
    steps/
      load-context.ts       — Step 1: Load publication + topics + recent ideas from D1
      search.ts             — Step 2: Alexander API search with KV cache
      dedupe.ts             — Step 3: LLM-based story dedup against recent ideas
      generate-ideas.ts     — Step 4: LLM idea generation from filtered stories
      store-ideas.ts        — Step 5: Persist ideas to D1
      auto-write.ts         — Step 6: Trigger writer-agent for auto-write/publish
    types.ts                — Shared types (Publication, Topic, Idea, etc.)
    utils.ts                — Helpers (slugify, hashQuery, timestamps)
  wrangler.jsonc
  package.json
  tsconfig.json
```

---

## Error Handling Strategy

Each workflow step has its own retry config. Failures are isolated — a failed step retries without re-running completed steps.

| Step              | Error                       | Handling                                                             | Retries |
| ----------------- | --------------------------- | -------------------------------------------------------------------- | ------- |
| 1. Load Context   | D1 read failure             | Workflow fails, queue retries the message                            | 2       |
| 2. Search         | Alexander API timeout/error | `cachedSearch` returns null for failed topics, continues with others | 2       |
| 3. Dedupe         | LLM timeout/bad response    | Returns all stories unfiltered (skip dedup)                          | 2       |
| 4. Generate Ideas | LLM timeout/bad response    | Returns empty array, no ideas stored                                 | 2       |
| 5. Store Ideas    | D1 write failure            | Workflow fails, can be retried from this step                        | 0       |
| 6. Auto-Write     | Writer-agent unreachable    | Logged, ideas already stored for manual use                          | 1       |

**Queue-level retries:** If the entire workflow fails (e.g., the worker crashes), the queue retries the message up to 3 times. After 3 failures, the message goes to the dead-letter queue.

---

## Alexander API Usage Summary

| Endpoint            | Purpose in Scout                                                     | When Called                   |
| ------------------- | -------------------------------------------------------------------- | ----------------------------- |
| `POST /search/news` | Find breaking news per topic (last 24h)                              | Step 2, per topic (KV-cached) |
| `POST /search`      | Find analysis/articles per topic (last week)                         | Step 2, per topic (KV-cached) |
| `POST /research`    | NOT used by scout (too slow). Used by writer-agent when auto-writing | Indirectly via writer-agent   |
| `POST /questions`   | NOT used by scout. Available to writer-agent during writing          | Indirectly via writer-agent   |
| `POST /crawl`       | NOT used by scout. Writer-agent uses for source verification         | Indirectly via writer-agent   |

**Why only `searchNews` + `search`:** The scout needs fast, broad discovery. The `/research` endpoint takes 1-2 minutes per query (deep multi-source synthesis) — overkill for idea generation. The writer-agent uses `/research` during actual writing when depth matters.

---

## Open Considerations

1. **Token usage:** Each scout run per publication makes 2 LLM calls (dedup + ideas). Estimate ~$0.06-0.12 per publication per day with claude-sonnet-4-6. Can optimize the dedup step to use Haiku later.

2. **Auto-write token usage:** Each auto-written post costs ~$0.50-1.00 (full writer-agent conversation with research).

3. **KV cache hit rates:** Depends on topic overlap across publications. With 50 publications sharing common topics like "AI", cache hit rates could be 30-50%, significantly reducing Alexander API calls.

4. **Queue throughput:** With `max_batch_size: 1` and default concurrency, CF Queues will process publications with some parallelism. If we need more control, set `max_concurrency` explicitly.

5. **Workflow observability:** CF Workflows have built-in status tracking. We can query workflow instance status via the API or dashboard to monitor scout health.
