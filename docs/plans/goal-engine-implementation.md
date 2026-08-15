# Goal Engine — Implementation Plan

**Status:** Draft (brainstorm-approved direction)
**Owner:** Shahar
**Created:** 2026-06-27
**Related:** `.agentspack/plans/scout.md` (existing topic-driven scout), `docs/SYSTEM_REFERENCE.md`

---

## 1. The repositioning (why this exists)

HotMetal today is **"AI blogging platform with syndication"**: the canonical unit is a blog `Post`; LinkedIn/X are `renditions` derived from it; the user's top-level mental primitive is **Topics** attached to a **Publication** (a blog).

We are moving to a **goal-driven, multi-channel authority engine**. The user declares a **Goal** ("become the go-to voice in applied AI"); the engine drives topics, sources, cadence, and — critically — produces **channel-native** content across formats (LinkedIn post, LinkedIn carousel, X thread, blog post, …). The blog becomes *one channel among many*, not the source everything is squeezed from.

This serves both audiences with the same engine:
- **Individual:** one Goal → personal LinkedIn + X + a blog.
- **Organization:** one Goal per product → company LinkedIn page + X + company blog.

### Settled model

```
Account
  ├─ Channels (shared, account-scoped assets — connect once)
  │    ├─ Publications (0..n)   blogs; identity/voice/branding live HERE; fleet untouched
  │    └─ Connected accounts     LinkedIn, X, IG, Threads (existing social_connections)
  └─ Goals (1..n)
       ├─ statement + subGoals[]      → compiled into ONE north-star paragraph for the LLM
       ├─ audience, positioning
       ├─ targets → which Channels this goal posts to (many-to-many)
       ├─ content plan (cadence + per-channel format mix)
       └─ topics / sources / ideas → deliverables (derived, goal-owned, channel-routed)
```

**Decided in brainstorm:**
- Container is named **Goal** (most direct, zero-explanation). Its headline field is `statement`.
- **Sub-goals** are decomposition sugar — not containers. Start as a JSON array on the goal; compile `statement + subGoals[]` into one north-star paragraph. Promote to a child table later only if we attribute metrics to a slice.
- **Channels are account-scoped, not goal-scoped.** A goal *targets* a subset (m:n). A shared company blog can receive content from two goals. (Already true in the schema: `publications` and `social_connections` are `user_id`-scoped.)
- **Voice resolves as channel-baseline + goal-angle.** The channel keeps its identity/voice (`publications.branding`/`writing_tone`/`style_id` stay put); the goal layers positioning/angle on top.
- **Cadence guards** (over-posting a shared channel) are the **user's responsibility in v1**. Future: a cross-goal **"master agent"** that balances volume/dedup across goals targeting the same channel.
- **Topics & Sources are auto-proposed but fully user-editable** (add/edit/remove). The engine is a co-pilot strategist, never a black box.

### Three forks — locked defaults (reversible)
1. **Sources in v1** → approximate as Alexander site/keyword-scoped retrieval; true feed/social monitoring (RSS, handles, arXiv) is a later upgrade.
2. **Strategy synthesis UX** → light guided intake (statement + a few structured prompts) → one-shot LLM proposal → fully editable review.
3. **Closed loop** (engagement → re-tune) → explicitly **Phase D**, after there's published history to learn from.

---

## 2. Build strategy: parallel, additive, with a cleanup ledger

Per the directive: **build the new flow in new pages/routes/tables that run alongside the current design**, then retire the old surfaces once the new flow proves out.

**Principles**
- **Additive DB only.** New tables (`goals`, `goal_targets`, `sources`, `deliverables`); add a **nullable `goal_id`** to `topics` and `ideas`. No destructive re-parenting. Old publication-driven rows keep `goal_id = NULL` and work exactly as today.
- **New scout path beside the old.** A new `GoalScoutWorkflow` + goal due-query + queue path. The existing `ScoutWorkflow` (publication-driven) is untouched. Shared steps (`search`, `dedupe`, `generate-ideas`) are reused as functions.
- **New nav + pages under `/goals/*`.** Existing `/publications`, `/ideas`, `/writing` are untouched.
- **New API modules** (`goals.ts`, `sources.ts`, `deliverables.ts`) mounted alongside existing ones.
- **Blog rendering stack untouched.** Subdomains, custom domains, EmDash fleet, pub-web routing are all publication-scoped and unaffected.

### Deprecation Ledger (remove only after goal-flow parity is proven)
| Surface | File(s) | Replaced by |
|---|---|---|
| Per-publication Topics UI | `apps/web/src/api/topics.ts` (`/publications/:pubId/topics`), publication settings topics editor | Goal-scoped topics in strategy review |
| Publication-scoped Ideas | `apps/web/src/pages/IdeasPage.tsx` (publication framing), `/api/publications/:pubId/ideas` | `/goals/:id/ideas` inbox |
| Publication-level scout schedule/automation UI | `PublicationPage` (settings: schedule, auto_publish_mode, scout_enabled) | Goal-level content plan |
| Old publication-driven scout | `services/content-scout` `enqueueDuePublications`, `ScoutWorkflow`, `load-context.ts` (publication) | `GoalScoutWorkflow` + goal context |
| Blog-centric single-format publish | parts of `apps/web/src/api/publish.ts` framing | Multi-format deliverables composer |

> Keep this table updated as each phase lands. Nothing here is deleted until the new equivalent is shipped and validated.

---

## 3. Data model (migration `0023_goals.sql`)

```sql
-- Goals: the top-level container
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  statement TEXT NOT NULL,                 -- the north-star line
  sub_goals TEXT,                          -- JSON array of strings (decomposition sugar)
  audience TEXT,                           -- who we're reaching
  positioning TEXT,                        -- angle / POV
  status TEXT NOT NULL DEFAULT 'active',   -- active | paused | archived
  -- content plan / automation (moved to goal level; mirrors publication fields)
  auto_publish_mode TEXT NOT NULL DEFAULT 'ideas-only', -- ideas-only | draft | full-auto
  scout_schedule TEXT,                     -- JSON (reuse ScoutSchedule shape)
  scout_enabled INTEGER NOT NULL DEFAULT 1,
  next_scout_at INTEGER,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  format_mix TEXT,                         -- JSON: per-channel weekly format counts
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_due ON goals(scout_enabled, next_scout_at);

-- Goal → Channel targeting (many-to-many). A channel is EITHER a publication OR a connection.
CREATE TABLE IF NOT EXISTS goal_targets (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,               -- 'publication' | 'connection'
  publication_id TEXT REFERENCES publications(id) ON DELETE CASCADE,
  connection_id TEXT REFERENCES social_connections(id) ON DELETE CASCADE,
  settings TEXT,                           -- JSON: per-channel cadence/format overrides, auto_publish
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_goal_targets_goal ON goal_targets(goal_id);

-- Sources: things to monitor (first-class). Auto-proposed + user-editable.
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                       -- person | publication | feed | site | handle
  label TEXT NOT NULL,
  identifier TEXT NOT NULL,                 -- URL / domain / handle
  platform TEXT,                            -- web | x | linkedin | rss | arxiv | youtube ...
  weight INTEGER DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_sources_goal ON sources(goal_id);

-- Deliverables: generalizes "renditions" — one row per (idea, channel/format).
CREATE TABLE IF NOT EXISTS deliverables (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  idea_id TEXT REFERENCES ideas(id) ON DELETE SET NULL,
  format TEXT NOT NULL,                     -- blog | linkedin_post | linkedin_carousel | x_thread | x_post | ig_carousel | threads_post
  channel_target_id TEXT REFERENCES goal_targets(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES sessions(id),  -- when produced via a writer-agent session
  content TEXT,                             -- channel-native body (JSON for structured formats like carousels/threads)
  status TEXT NOT NULL DEFAULT 'draft',     -- draft | ready | scheduled | published | failed
  scheduled_at INTEGER,
  published_at INTEGER,
  external_ref TEXT,                        -- JSON: external id/url after publish
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_deliverables_goal ON deliverables(goal_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_idea ON deliverables(idea_id);

-- Additive, non-breaking links on existing tables
ALTER TABLE topics ADD COLUMN goal_id TEXT REFERENCES goals(id) ON DELETE CASCADE;
ALTER TABLE ideas  ADD COLUMN goal_id TEXT REFERENCES goals(id) ON DELETE CASCADE;
ALTER TABLE ideas  ADD COLUMN suggested_formats TEXT;   -- JSON array of format strings
CREATE INDEX IF NOT EXISTS idx_topics_goal ON topics(goal_id);
CREATE INDEX IF NOT EXISTS idx_ideas_goal ON ideas(goal_id);
```

> `topics.publication_id` / `ideas.publication_id` stay `NOT NULL` today. To allow goal-owned rows without a publication, the migration must also relax those to nullable (rebuild table in SQLite, or — simpler — create goal rows with a sentinel and prefer the new `goal_id`). **Decision for Phase 0:** relax `topics.publication_id` and `ideas.publication_id` to nullable via table rebuild in `0023`, since goal-owned topics/ideas have no publication. Old rows keep their publication_id; new rows set goal_id.

**`@hotmetal/content-core` new types:** `Goal`, `SubGoal` (string), `Source`, `SourceType`, `GoalTarget`, `Deliverable`, `DeliverableFormat`, `Channel`. Reuse existing `ScoutSchedule`, `AutoPublishMode`.

**DAL (`services/data-layer/src/domains/`)**, new + extended modules:
- `goals.ts` — CRUD, `getDueGoals(now)`, `getAllGoalIds()`, `updateGoalNextScoutAt()`, compile north-star helper.
- `sources.ts` — CRUD, `listSourcesByGoal(goalId)`.
- `goal-targets.ts` — CRUD, `listTargetsByGoal(goalId)`.
- `deliverables.ts` — CRUD, `listByGoal`, `listByIdea`, status transitions.
- extend `topics.ts` (`listTopicsByGoal`, goal-scoped create) and `ideas.ts` (`listIdeasByGoal`, `getRecentIdeasByGoal`, store with `goal_id` + `suggested_formats`).
- Register new RPC methods on the DAL `WorkerEntrypoint` (`services/data-layer/src/index.ts`).

---

## 4. The end-to-end workflow (phased)

Each phase delivers a usable slice of: **create goal → strategy → discovery → ideas → produce → publish.**

### Phase 0 — Foundations
- Migration `0023` + DAL domains + content-core types (above).
- New web nav entry **Goals** (`/goals`) in `apps/web/src/components/layout/Sidebar.tsx`.
- Route shells in `apps/web/src/app.tsx` (protected): `/goals`, `/goals/new`, `/goals/:id`, `/goals/:id/ideas`, `/goals/:id/ideas/:ideaId` (composer), `/goals/:id/plan`, `/goals/:id/settings`.
- New API module `apps/web/src/api/goals.ts` (CRUD) mounted in `server.ts`.
- **Exit:** can create/list/read a bare Goal; nav works; nothing else disturbed.

### Phase 1 — Goal creation + strategy synthesis (Stages 0–1)
- **Intake page** `/goals/new`: statement + a few structured prompts (audience, your edge, channels you care about). `POST /api/goals`.
- **Strategy synthesis** `POST /api/goals/:id/synthesize` (LLM, Claude Sonnet via Wilson middleware, in `apps/web`): compiles north star → proposes **pillars + topics + sources + channel/format recommendation + cadence**. Returns a proposal (not yet persisted).
- **Review/edit screen** `/goals/:id` (or a setup step): edit pillars/topics/sources; **pick channel targets** — connect/create publications (reuse `/api/publications` create + provision) and connect LinkedIn/X (reuse `/api/connections`); set cadence + per-channel format mix. On save: persist `topics` (goal_id), `sources`, `goal_targets`, `goals.format_mix`/schedule.
- Sources in v1 stored as `type='site'|'publication'` with `identifier` used for Alexander site-scoped queries.
- **Exit:** a goal stands up a full, editable strategy and targets real channels.

### Phase 2 — Goal-driven discovery (Stage 2)
- **New `GoalScoutWorkflow`** in `services/content-scout` (param `{ goalId, triggeredBy }`), beside `ScoutWorkflow`. New `enqueueDueGoals` cron path using `DAL.getDueGoals`. New `SCOUT_GOAL_QUEUE` (or reuse queue with a discriminated message `{ kind: 'goal' | 'publication' }`).
- Steps: `load-goal-context` (goal + topics + sources + recent goal ideas) → **reuse** `search` (topics) + new `search-sources` (Alexander site-scoped) → **reuse** `dedupe` → new `rank-by-goal-fit` (relevance · timeliness · novelty · goal-fit · positioning-fit) → `generate-ideas` extended to emit `suggested_formats[]` → `store-ideas` with `goal_id`.
- **Ideas inbox** `/goals/:id/ideas`: ranked ideas framed as "opportunities to advance your goal," each chip-tagged with suggested format(s). New `GET /api/goals/:id/ideas`.
- **Exit:** a scheduled (and manual "Run now") goal scout produces format-tagged, goal-ranked ideas.

### Phase 3 — Multi-format production (Stage 3)
- **Deliverables + composer** `/goals/:id/ideas/:ideaId`: from one idea, generate channel-native deliverables side-by-side. New `apps/web/src/api/deliverables.ts`.
- v1 formats:
  - **Blog** — reuse a writer-agent session seeded from the idea (existing flow), result stored as a `blog` deliverable.
  - **LinkedIn post** — promote existing `generate-linkedin-post` (writer-agent) to a first-class deliverable generator.
  - **X thread** — extend existing `generate-tweet` into a thread generator (hook + beats). Small new prompt in `apps/web/src/agent` + `createThread` helper.
- Each deliverable independently editable; status `draft → ready`.
- **Exit:** one idea → multiple editable, channel-native deliverables persisted.

### Phase 4 — Publish + schedule + calendar (Stage 3 cont.)
- Route deliverables to channels via existing **publisher** adapters (`/publish/blog`, `/publish/linkedin`, `/publish/twitter`). Add per-deliverable schedule (`scheduled_at`) + a small scheduler (cron sweep over due deliverables, or reuse a queue).
- **Content calendar** view at `/goals/:id/plan`: planned/drafted/scheduled/published across channels; honors the per-goal format mix. (Cadence guard across goals is user's responsibility — Section 1.)
- **Exit:** publish a LinkedIn post + X thread + blog post from one idea; see them on the calendar.

### Phase 5 — Carousels (later, highest differentiation)
- LinkedIn/IG carousel = structured slides (LLM slide-structuring) → rendered via existing image pipeline (Flux + design system) → PDF (LinkedIn doc post) or image set (IG). **Verify LinkedIn document-post API access**; fallback = generate + download + assisted publish.

### Phase 6 — Closed loop (Phase D)
- Ingest LinkedIn/X/blog engagement → attribute to pillar/topic/format/source → **weekly strategy review** proposing plan adjustments (human-in-loop). Foundation for the cross-goal **master agent**.

---

## 5. New / changed file inventory (Phases 0–4)

**Data layer**
- `services/data-layer/migrations/0023_goals.sql` *(new)*
- `services/data-layer/src/domains/{goals,sources,goal-targets,deliverables}.ts` *(new)*
- `services/data-layer/src/domains/{topics,ideas}.ts` *(extend: goal-scoped queries)*
- `services/data-layer/src/types.ts` + `services/data-layer/src/index.ts` *(types + RPC registration)*
- `packages/content-core/src/types/*` *(new shared types)*

**Web (apps/web)**
- `src/api/{goals,sources,deliverables}.ts` *(new; mount in `src/server.ts`)*
- `src/pages/goals/{GoalsPage,NewGoalPage,GoalOverviewPage,GoalIdeasPage,ComposerPage,GoalPlanPage,GoalSettingsPage}.tsx` *(new)*
- `src/app.tsx` *(routes)*, `src/components/layout/Sidebar.tsx` *(nav entry)*, `src/lib/api.ts` *(client fns)*
- `src/agent/*` *(extend: X-thread generator; promote LI/tweet to deliverable generators)*

**Content scout (services/content-scout)**
- `src/goal-workflow.ts` (`GoalScoutWorkflow`) *(new)*
- `src/steps/{load-goal-context,search-sources,rank-by-goal-fit}.ts` *(new)*; reuse `search.ts`, `dedupe.ts`, `generate-ideas.ts` (extend output schema)
- `src/index.ts` *(new cron `enqueueDueGoals` + queue consumer branch)*; `src/env.ts` *(new workflow/queue bindings)*; `wrangler.jsonc`

**Publisher (services/publisher)** — Phase 4: no new adapters needed for blog/LI/X; add a deliverable-aware publish entry + scheduling sweep.

---

## 6. Risks & open items
- **LinkedIn API reality** (text post via UGC works today in `linkedin-adapter.ts`; **carousels/document posts are partner-gated** — confirm before Phase 5; plan assisted-publish fallback). Flagged in PRD §4.4.
- **Higher trust stakes** on personal channels → autonomy posture (propose-and-approve vs auto-pilot) revisit before enabling `full-auto` for social. (Brainstorm left this open; default to propose-and-approve for social, auto-pilot allowed for blog.)
- **Tier limits** re-expressed around goals/channels/formats instead of topics/posts (`packages/shared` tiers). Re-tier in Phase 1.
- **Nullable publication_id rebuild** in `0023` (SQLite table rebuild) — test against shared dev D1 with `--persist-to`.
- **Scout cost**: goal path adds a ranking LLM call per run; reuse the cheaper-model pattern (Haiku for dedupe/rank) noted in `scout.md`.

---

## 7. Immediate next step
Phase 0: write `0023_goals.sql`, the DAL domains, content-core types, and the nav/route/API shells. Then Phase 1 (goal creation + strategy synthesis) — the slice that delivers the "tell it your goal and it drives everything" magic.
