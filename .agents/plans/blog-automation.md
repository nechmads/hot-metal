# Blog Automation Plan

> **Related documents:** This plan covers the full automation system. The Content Scout worker has its own detailed implementation plan at [`.agents/plans/scout.md`](scout.md) — read both documents before implementing Phase 5.

## Overview

Transform Hot Metal from a manual writing tool into an automated content engine. The platform will discover trending stories, generate blog post ideas, and optionally write and publish posts on a configurable cadence — all organized around **publications** (blogs) and **topics of interest**.

### Core Workflow

```
[Cron] Content Scout wakes up
  → Searches news/blogs for topics of interest
  → Generates idea briefs (with dedup against recent ideas)
  → Depending on auto-publish mode:
      draft:     creates writing session with research context, waits for human
      publish:   creates session, AI writes, publishes immediately
      full-auto: same as publish, runs on configured cadence (e.g., 3/week)
```

### New UX Structure

Left sidebar navigation with three centers:

- **Ideas** — AI-generated post ideas from the content scout
- **Writing** — existing sessions/workspace (what we have today)
- **Schedule** — publication config, topics, auto-publish settings, content calendar

---

## Key Design Decisions & Rationale

### 1. Single shared CMS (SonicJS)

**Decision:** All publications share the same SonicJS CMS instance. No per-publication CMS credentials.

**Why:** The CMS already has a `publications` collection with a reference field on posts. Each blog frontend simply filters by publication ID. This avoids managing multiple CMS connections and keeps the architecture simple. The writer-agent keeps `CMS_URL` and `CMS_API_KEY` as env vars, and passes the `publicationId` when creating posts.

### 2. Publication config in WRITER_DB, not CMS

**Decision:** Publication automation config (topics, description, writing tone, auto-publish mode, cadence) lives in WRITER_DB alongside sessions. The CMS publication record stays lightweight (title, slug, url, image).

**Why:** The CMS is a content store. Automation settings (cron schedules, writing tone, topic weights) are operational config that belongs in the writer platform's database. We link them via `cms_publication_id`.

### 3. Multi-user ready, single-user for now

**Decision:** All tables include `user_id` columns and the data model supports multiple users, but we hardcode a default user. No auth system yet.

**Why:** Adding `user_id` now costs nothing but saves a painful migration later. Auth can be layered on top when needed.

### 4. Shared D1 database

**Decision:** The content scout and writer-agent share `WRITER_DB` (same D1 database). New tables are added via migrations.

**Why:** The data is deeply interrelated — ideas reference publications, sessions reference ideas, publications own topics. A shared DB with foreign keys is simpler than cross-service data syncing. Both workers bind to the same D1 database.

### 5. Deduplication via LLM context

**Decision:** Story dedup is handled by a dedicated LLM step that compares new search results against recent idea titles/angles (last 7 days). Stories covering the same underlying event or topic as an existing idea are filtered out before idea generation.

**Why:** The problem is "same story" not "same URL" — a TechCrunch and Verge article about the same event are different URLs but the same story. LLM-based semantic comparison catches this naturally. No need for a `processed_sources` table or URL tracking. The dedup is a separate workflow step so its output is persisted — if idea generation fails, we don't re-run the dedup.

### 6. Scout uses CF Queue + Workflow for durability

**Decision:** The scout uses a CF Queue for fan-out (1 message per publication) and CF Workflows for durable multi-step execution per publication. A KV namespace caches Alexander API search results across publications.

**Why:**
- **Queue:** A single cron invocation can't reliably process 100 publications — one failure could block others. The queue isolates each publication, provides automatic retry, and has a dead-letter queue for persistent failures.
- **Workflow:** The scout pipeline has expensive steps (Alexander API calls, LLM calls). If step 4 fails after step 2 succeeds, the workflow resumes from step 4 without re-running searches. Each step's output is persisted.
- **KV cache:** Publications with overlapping topics (e.g., "AI") would make redundant Alexander API calls. The KV cache (24h TTL) ensures each unique search query hits the API only once per day.

### 7. Single cron trigger with application-level cadence

**Decision:** One cron schedule (`0 7 * * *`) triggers for all publications. Per-publication cadence (e.g., "3 posts/week" for full-auto) is enforced in application logic, not cron config.

**Why:** CF Workers cron triggers are statically configured in `wrangler.jsonc` — you can't have dynamic per-publication schedules. The cron wakes the scout daily, and the auto-write step checks "should this publication publish today?" based on its cadence and recent publish count.

### 8. Scout worker scaffolded via Wrangler CLI

**Decision:** The content-scout worker should be created by asking the user to run `npx wrangler init` (or the latest CF scaffolding command), so we use the latest Cloudflare Worker template.

**Why:** Cloudflare's tooling evolves quickly. Using their latest scaffold ensures we get current best practices, correct `wrangler.jsonc` format, and compatible dependency versions rather than hand-crafting config that may be outdated.

---

## Data Model

### New Tables (in WRITER_DB)

#### `users`

Lightweight user record for the writer platform. Not the CMS user — just enough for multi-user readiness.

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
```

Seed with a default user on first migration:

```sql
INSERT INTO users (id, email, name) VALUES ('default', 'shahar@hotmetalapp.com', 'Shahar');
```

#### `publications`

Publication automation config. Links to CMS publication by ID.

```sql
CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  cms_publication_id TEXT,              -- SonicJS content ID for the publication record
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,                     -- what this publication covers, used by scout to understand scope
  writing_tone TEXT,                    -- writing style/voice for AI-generated content (e.g. "skeptical tech analyst")
  default_author TEXT DEFAULT 'Shahar',
  auto_publish_mode TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'publish' | 'full-auto'
  cadence_posts_per_week INTEGER DEFAULT 3,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_publications_user_id ON publications(user_id);
```

`description` example: _"A technology blog covering AI, software engineering, and developer tools. Focused on practical implications for working developers rather than hype."_

`writing_tone` example: _"Skeptical tech analyst voice. Conversational but data-driven. Prefers contrarian angles backed by evidence. Avoids marketing speak."_

#### `topics`

Topics of interest per publication. Each topic has a name plus an angle description that shapes how the scout interprets it.

```sql
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,                     -- the user's angle on this topic
  priority INTEGER DEFAULT 1,           -- 1=normal, 2=high, 3=urgent
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_topics_publication_id ON topics(publication_id);
```

Example topic:

- name: "AI in Software Engineering"
- description: "Focus on practical implications for working developers. Skeptical of hype. Interested in real productivity data, tool comparisons, and workflow changes."
- priority: 2

#### `ideas`

AI-generated post ideas from the content scout.

```sql
CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  angle TEXT NOT NULL,                  -- the suggested editorial angle
  summary TEXT NOT NULL,                -- 2-3 paragraph brief
  sources TEXT,                         -- JSON array of { url, title, snippet, publishedAt }
  status TEXT NOT NULL DEFAULT 'new',   -- 'new' | 'reviewed' | 'promoted' | 'dismissed'
  session_id TEXT REFERENCES sessions(id),  -- set when promoted to a writing session
  relevance_score REAL,                 -- 0-1 score from the scout LLM
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_ideas_publication_id ON ideas(publication_id);
CREATE INDEX IF NOT EXISTS idx_ideas_status ON ideas(status);
CREATE INDEX IF NOT EXISTS idx_ideas_created_at ON ideas(created_at);
```

#### Modify existing `sessions` table

Add `publication_id` and `idea_id` columns:

```sql
ALTER TABLE sessions ADD COLUMN publication_id TEXT REFERENCES publications(id);
ALTER TABLE sessions ADD COLUMN idea_id TEXT REFERENCES ideas(id);
ALTER TABLE sessions ADD COLUMN seed_context TEXT;  -- research context from the idea for the writer-agent
```

`seed_context` stores the research material (sources, key points, suggested angle) that pre-seeds the writer-agent when a session is created from an idea.

---

## Implementation Phases

### Phase 1: Data Model & Users (Tasks 1-3)

**Goal:** Set up the database foundation and default user.

#### Task 1: Create D1 migration for new tables

Add migration file `services/writer-agent/migrations/0002_automation.sql` with:

- `users` table + default user seed
- `publications` table
- `topics` table
- `ideas` table
- ALTER `sessions` to add `publication_id`, `idea_id`, `seed_context`

Since we're in dev mode, we can wipe existing data. The migration should be clean.

#### Task 2: Add TypeScript types for new entities

Update `packages/content-core/src/types/` or create new types in a shared location:

- `User` interface
- `PublicationConfig` interface (distinct from the CMS `Publication` type)
- `Topic` interface
- `Idea` interface with status enum
- Update `Session` to include `publicationId`, `ideaId`, `seedContext`

#### Task 3: Create data access layer

Add managers/repositories for the new tables (following `SessionManager` pattern):

- `services/writer-agent/src/lib/user-manager.ts`
- `services/writer-agent/src/lib/publication-manager.ts`
- `services/writer-agent/src/lib/topic-manager.ts`
- `services/writer-agent/src/lib/idea-manager.ts`

### Phase 2: API Endpoints (Tasks 4-6)

**Goal:** CRUD endpoints for publications, topics, and ideas.

#### Task 4: Publication API routes

Add `services/writer-agent/src/routes/publications.ts`:

- `POST /api/publications` — create publication (also creates in CMS)
- `GET /api/publications` — list user's publications
- `GET /api/publications/:id` — get publication with topics
- `PATCH /api/publications/:id` — update config (name, description, writing tone, auto-publish mode, cadence)
- `DELETE /api/publications/:id` — delete publication and its topics/ideas

When creating a publication, the route should:

1. Create the record in WRITER_DB
2. Create the publication in the CMS via `CmsApi` (using the SonicJS collections API)
3. Store the `cms_publication_id` from the CMS response

#### Task 5: Topics API routes

Add `services/writer-agent/src/routes/topics.ts`:

- `POST /api/publications/:pubId/topics` — add topic
- `GET /api/publications/:pubId/topics` — list topics
- `PATCH /api/topics/:id` — update topic (name, description, priority, active)
- `DELETE /api/topics/:id` — remove topic

#### Task 6: Ideas API routes

Add `services/writer-agent/src/routes/ideas.ts`:

- `GET /api/publications/:pubId/ideas` — list ideas (filterable by status)
- `GET /api/ideas/:id` — get idea detail with sources
- `PATCH /api/ideas/:id` — update status (reviewed, dismissed)
- `POST /api/ideas/:id/promote` — promote to writing session (creates session with seed context)

The promote endpoint:

1. Creates a new session with `publication_id`, `idea_id`, and `seed_context`
2. The `seed_context` includes the idea's title, angle, summary, and sources
3. Updates the idea status to `promoted` and links the `session_id`
4. Returns the new session so the UI can navigate to it

### Phase 3: Left Nav Restructure (Tasks 7-9)

**Goal:** Replace the current full-page sessions view with a sidebar-based layout.

#### Task 7: Create sidebar navigation component

Create `apps/writer-web/src/components/layout/Sidebar.tsx`:

- Vertical nav with icons + labels: Ideas, Writing, Schedule
- Active state highlighting (amber accent)
- Collapsible on mobile (hamburger toggle)
- Publication selector dropdown at the top (when multiple publications exist)

#### Task 8: Create layout wrapper

Create `apps/writer-web/src/components/layout/AppLayout.tsx`:

- Sidebar on the left (fixed width, e.g., 200px)
- Main content area on the right
- Responsive: sidebar collapses to icons on tablet, becomes drawer on mobile

#### Task 9: Update routing

Update `apps/writer-web/src/app.tsx` using react-router's **declarative mode** (already in use):

```
/                           → redirect to /ideas (or /writing)
/ideas                      → IdeasPage (idea feed)
/ideas/:id                  → IdeaDetailPage
/writing                    → SessionsPage (existing, renamed)
/writing/:id                → WorkspacePage (existing)
/schedule                   → SchedulePage (publication config, topics, calendar)
/schedule/publication/:id   → PublicationSettingsPage
```

Wrap all routes in `AppLayout` with the sidebar.

Update the existing `SessionsPage` and `WorkspacePage` to work within the new layout (they currently assume full-page). The `Header` component gets simplified since the sidebar handles navigation.

### Phase 4: Publication & Topics Management UI (Tasks 10-12)

**Goal:** Let the user create publications and configure topics.

#### Task 10: Add frontend API functions

Add to `apps/writer-web/src/lib/api.ts`:

- `fetchPublications()`, `createPublication(data)`, `updatePublication(id, data)`, `deletePublication(id)`
- `fetchTopics(pubId)`, `createTopic(pubId, data)`, `updateTopic(id, data)`, `deleteTopic(id)`
- `fetchIdeas(pubId, filters?)`, `fetchIdea(id)`, `updateIdeaStatus(id, status)`, `promoteIdea(id)`

Add corresponding types to `types.ts`.

#### Task 11: Schedule/Settings page

Create `apps/writer-web/src/pages/SchedulePage.tsx`:

- If no publications exist: onboarding flow to create first publication
- Publication list with cards showing name, topic count, auto-publish mode
- Click → PublicationSettingsPage

Create `apps/writer-web/src/pages/PublicationSettingsPage.tsx`:

- Publication name, description (what the publication covers), default author
- Writing tone textarea (voice/style for AI-generated content)
- Auto-publish mode selector (draft / publish / full-auto)
- Cadence config (posts per week) — only shown for full-auto
- Topics section: list of topics with add/edit/delete
- Each topic: name input + description textarea + priority selector + active toggle

#### Task 12: Create publication flow

When creating a publication:

1. Modal with name, slug, description fields
2. On submit: call `createPublication()` which creates in both WRITER_DB and CMS
3. Navigate to the publication settings page to add topics

### Phase 5: Content Scout Worker (Tasks 13-16)

**Goal:** Build the worker that discovers news, generates ideas, and optionally auto-writes posts.

> **Detailed implementation guide:** See [`.agents/plans/scout.md`](scout.md) for the full scout architecture — discovery pipeline, Alexander API integration, LLM prompts, auto-write flow, and cron/queue/workflow setup.

**Key technology decisions:**

- **LLM model:** `claude-sonnet-4-5` — prioritize quality over cost; we can optimize later
- **AI SDK:** Vercel AI SDK V6 (`ai` package) — same version used in writer-agent
- **Research:** Alexander API (`@hotmetal/shared` AlexanderApi client) — `searchNews`, `search` endpoints for discovery
- **Publication context:** The scout uses the publication's `description` to understand what to look for, and `writing_tone` when auto-writing content
- **Execution model:** CF Cron → CF Queue (fan-out per publication) → CF Workflow (durable multi-step pipeline)
- **Caching:** CF KV namespace for Alexander API search result caching (24h TTL) — avoids redundant searches for overlapping topics across publications
- **Story dedup:** Separate LLM step compares new stories against recent ideas (last 7 days) to filter out already-covered ground

**CF resources needed:**

| Resource | Name | Purpose |
|---|---|---|
| Queue | `hotmetal-scout-queue` | Fan-out: 1 message per publication |
| Queue (DLQ) | `hotmetal-scout-dlq` | Dead-letter queue for persistent failures |
| KV Namespace | `hotmetal-scout-cache` | Cache search results across publications |
| Workflow | `scout-workflow` | Durable 6-step pipeline per publication |

#### Task 13: Scaffold the content-scout worker

**IMPORTANT:** Ask the user to run the Wrangler scaffolding command to create the worker:

```bash
cd services && npx wrangler init content-scout
```

This ensures we use the latest Cloudflare Worker template with current best practices. After scaffolding:

- Move into the monorepo structure (`services/content-scout`)
- Update `package.json` name to `@hotmetal/content-scout`
- Add to `pnpm-workspace.yaml` if needed
- Install dependencies: `ai`, `@ai-sdk/anthropic`, `@hotmetal/shared`, `hono`
- Create CF resources: Queue, DLQ, KV namespace (via `wrangler` CLI or dashboard)
- Configure `wrangler.jsonc` with:
  - Cron trigger: `crons = ["0 7 * * *"]` (single daily trigger)
  - Workflow binding: `scout-workflow` → `ScoutWorkflow` class
  - Queue producer + consumer: `hotmetal-scout-queue` with DLQ
  - KV binding: `hotmetal-scout-cache`
  - D1 binding: same `WRITER_DB` database
  - Environment vars: `ALEXANDER_API_URL`, `WRITER_AGENT_URL`
  - Secrets: `ALEXANDER_API_KEY`, `ANTHROPIC_API_KEY`, `WRITER_AGENT_API_KEY`

#### Task 14: Implement the scout workflow pipeline

See [scout.md](scout.md) for full details on each step.

The scout workflow runs 6 durable steps per publication:

1. **Load context** — publication config, active topics, recent ideas from D1
2. **Search** — Alexander API `searchNews` + `search` per topic, with KV cache
3. **Dedupe stories** — LLM call comparing new stories against recent ideas, filtering out already-covered ground
4. **Generate ideas** — LLM call producing 3-5 idea briefs from filtered stories
5. **Store ideas** — persist to D1 `ideas` table
6. **Auto-write** — (conditional) trigger writer-agent to write and publish top idea

Each step's output is persisted by the workflow runtime. If step 4 fails, it retries from step 4 without re-running steps 1-3.

#### Task 15: Implement the cron handler + queue consumer

See [scout.md](scout.md) for full details.

- **Cron handler:** Queries D1 for all publications, enqueues 1 message per publication to `hotmetal-scout-queue`
- **Queue consumer:** Receives messages, creates a `ScoutWorkflow` instance per publication
- **Manual triggers:** `POST /api/scout/run` (single publication) and `POST /api/scout/run-all`

Cadence enforcement (posts per week for full-auto mode) is application logic in step 6, not cron config.

#### Task 16: Implement the auto-write pipeline

See [scout.md](scout.md) for full details.

For publications with `auto_publish_mode` = `publish` or `full-auto`, step 6 of the workflow:

1. Checks cadence (full-auto only: have we hit the weekly quota?)
2. Picks the highest-scoring idea
3. Creates a writing session with seed context via writer-agent API
4. Sends a write instruction to the writer-agent
5. Polls for draft completion, then publishes to CMS

### Phase 6: Ideas Center UI (Tasks 17-19)

**Goal:** Let the user browse, review, and promote ideas.

#### Task 17: Ideas page

Create `apps/writer-web/src/pages/IdeasPage.tsx`:

- Filterable by status: All, New, Reviewed, Dismissed
- Publication selector (if multiple publications)
- Card grid showing: title, angle preview, topic badge, relevance score, source count, timestamp
- Quick actions: Mark as reviewed, Dismiss, Promote to session
- Empty state when no ideas yet (prompt to configure topics)

#### Task 18: Idea detail view

Create `apps/writer-web/src/pages/IdeaDetailPage.tsx`:

- Full idea brief: title, angle, summary
- Source articles list with links and snippets
- Related topic badge
- Action buttons: Promote to Writing Session, Dismiss
- Promote opens a confirmation that shows what session will be created

#### Task 19: Promote to session flow

When promoting an idea:

1. Call `promoteIdea(id)` API
2. Backend creates session with seed context, marks idea as promoted
3. Navigate to `/writing/:sessionId`
4. The writer-agent receives the seed context and uses it to pre-inform the conversation
5. The agent's system prompt includes the seed context so it can start with research already done

Update the writer-agent's `buildSystemPrompt` to include seed context when available. The `onStart` method should load `seed_context` from the session record and make it available.

### Phase 7: Schedule & Auto-Publish (Tasks 20-22)

**Goal:** Configure and visualize the automated publishing pipeline.

#### Task 20: Auto-publish configuration

Already part of the PublicationSettingsPage (Task 11), but ensure the UI includes:

- Mode selector with clear descriptions:
  - **Draft** — "Scout finds ideas. You decide what to write."
  - **Publish** — "Scout finds ideas and publishes the best one each run."
  - **Full Auto** — "Scout finds ideas and publishes on your cadence."
- Cadence slider/input for full-auto mode
- "Run Scout Now" button for manual triggers

#### Task 21: Content calendar view

Add a simple calendar/timeline to the SchedulePage:

- Shows published posts (from CMS) on their publish dates
- Shows upcoming auto-publish slots (based on cadence)
- Shows sessions in progress
- This is read-only for now — just visibility into what's happened and what's coming

#### Task 22: Wire up manual scout trigger

The "Run Scout Now" button in publication settings:

1. Calls `POST /api/scout/run` with the publication ID
2. The content-scout worker runs the discovery pipeline for that publication
3. Shows a loading state, then navigates to Ideas page to see results

This requires the writer-web to be able to call the content-scout's API. Options:

- Route through the writer-agent proxy (simplest)
- Direct call to content-scout (needs another proxy entry in writer-web's server.ts)

Recommended: Add a `/api/publications/:id/scout` endpoint on the writer-agent that internally calls the content-scout. This keeps the frontend's API surface unified.

### Phase 8: Writer-Agent Updates (Tasks 23-24)

**Goal:** Update the writer-agent to support publication context and seed data.

#### Task 23: Publication-aware sessions

Update session creation to require `publication_id`:

- `POST /api/sessions` now accepts `publicationId` (required) and `seedContext` (optional)
- The writer-agent's system prompt includes publication info (name, default author)
- When publishing, the agent includes `publicationId` in the CMS post

Update `CmsApi.createPost()` calls to include `publicationId` from the session's publication config.

#### Task 24: Seed context in writer-agent

When a session has `seed_context`:

- Load it on `onStart` and store in agent state
- Include it in the system prompt as "Research Context" section
- The agent starts the conversation aware of the topic, angle, and sources
- If auto-writing (no human in the loop), send an initial message instructing the agent to write a complete post based on the seed context

---

## File Changes Summary

### New Files

| File                                                    | Description                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| `services/writer-agent/migrations/0002_automation.sql`  | New tables: users, publications, topics, ideas + sessions alterations |
| `services/writer-agent/src/lib/publication-manager.ts`  | Publication CRUD                                                      |
| `services/writer-agent/src/lib/topic-manager.ts`        | Topic CRUD                                                            |
| `services/writer-agent/src/lib/idea-manager.ts`         | Idea CRUD + promote                                                   |
| `services/writer-agent/src/lib/user-manager.ts`         | User CRUD                                                             |
| `services/writer-agent/src/routes/publications.ts`      | Publication API routes                                                |
| `services/writer-agent/src/routes/topics.ts`            | Topic API routes                                                      |
| `services/writer-agent/src/routes/ideas.ts`             | Idea API routes                                                       |
| `services/content-scout/`                               | **New worker** (scaffold via `npx wrangler init`)                     |
| `services/content-scout/src/workflow.ts`                | ScoutWorkflow — durable 6-step pipeline                               |
| `services/content-scout/src/steps/search.ts`            | Alexander API search with KV cache                                    |
| `services/content-scout/src/steps/dedupe.ts`            | LLM-based story dedup against recent ideas                            |
| `services/content-scout/src/steps/generate-ideas.ts`    | LLM idea generation from filtered stories                             |
| `services/content-scout/src/steps/auto-write.ts`        | Auto-write/publish pipeline via writer-agent                          |
| `apps/writer-web/src/components/layout/Sidebar.tsx`     | Left navigation sidebar                                               |
| `apps/writer-web/src/components/layout/AppLayout.tsx`   | Layout wrapper with sidebar                                           |
| `apps/writer-web/src/pages/IdeasPage.tsx`               | Ideas feed page                                                       |
| `apps/writer-web/src/pages/IdeaDetailPage.tsx`          | Idea detail/promote page                                              |
| `apps/writer-web/src/pages/SchedulePage.tsx`            | Schedule & publication list                                           |
| `apps/writer-web/src/pages/PublicationSettingsPage.tsx` | Publication config + topics                                           |

### Modified Files

| File                                                                   | Changes                                                     |
| ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| `packages/content-core/src/types/`                                     | Add User, PublicationConfig, Topic, Idea types              |
| `apps/writer-web/src/app.tsx`                                          | New routing structure with sidebar layout                   |
| `apps/writer-web/src/lib/api.ts`                                       | New API functions for publications, topics, ideas           |
| `apps/writer-web/src/lib/types.ts`                                     | New frontend types                                          |
| `apps/writer-web/src/pages/SessionsPage.tsx`                           | Adapt to work within sidebar layout, add publication filter |
| `apps/writer-web/src/pages/WorkspacePage.tsx`                          | Minor: adapt header for sidebar layout                      |
| `apps/writer-web/src/components/layout/Header.tsx`                     | Simplify — sidebar handles main nav                         |
| `services/writer-agent/src/index.ts`                                   | Register new routes                                         |
| `services/writer-agent/src/routes/index.ts`                            | Export new routes                                           |
| `services/writer-agent/src/routes/sessions.ts`                         | Add publication_id to session creation                      |
| `services/writer-agent/src/agent/writer-agent.ts`                      | Load seed context, publication-aware prompts, writing tone  |
| `services/writer-agent/src/prompts/system-prompt.ts`                   | Include seed context, publication info, writing tone        |
| `services/writer-agent/src/tools/cms-publish.ts`                       | Pass publicationId when publishing                          |
| `services/writer-agent/src/agent/writer-agent.ts` `handlePublishToCms` | Pass publicationId                                          |

---

## Verification

After each phase:

1. `pnpm --filter @hotmetal/writer-agent typecheck` — zero errors
2. `pnpm --filter @hotmetal/writer-web typecheck` — zero errors
3. `pnpm --filter @hotmetal/content-scout typecheck` — zero errors (after Phase 5)
4. All services build successfully

End-to-end flow test:

1. Create a publication with topics in the Schedule center
2. Run the scout manually — ideas appear in the Ideas center
3. Promote an idea to a writing session
4. Session opens with research context pre-loaded
5. Write and publish the post — it appears on the blog tagged with the publication
6. Configure full-auto mode — scout writes and publishes on next run

---

## Open Questions

1. **Notification system** — Should we notify the user when new ideas are generated? Email? Push? For now, they just check the Ideas page. Can add notifications later.
2. **Idea expiry** — Should old ideas auto-dismiss after N days? Prevents stale news ideas from cluttering the feed. Suggest 14-day auto-dismiss.
3. **Scout frequency** — Daily at 7 AM UTC is the default. Should this be configurable per publication? Probably yes for full-auto, but can add later.
