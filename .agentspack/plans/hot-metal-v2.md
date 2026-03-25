# Hot Metal V2 — Goal-Centric Platform Overhaul

**Owner:** Shahar
**Created:** 2026-03-23
**Updated:** 2026-03-25
**Status:** Phase 1 Planning
**Branch:** `hot-metal-v2` (long-lived base branch; feature branches merge into this)

---

## 1) Vision

Shift Hot Metal from being **publication-centric** (create a publication → write into it) to being **goal-centric** (pick an outcome → get a strategy → execute across channels).

Users come to Hot Metal for outcomes. V1 goal types:
- **Build their personal brand** — become recognized as an expert in a domain
- **Build awareness for a product** — get a SaaS/product noticed by the right audience

Future goal types (not in V1): Increase sales, Thought leadership, Custom/just write.

Each goal requires different knowledge, different content strategies, and different channel mixes.

**Key entity change:** The new top-level entity is a **Project**. A Project has a goal (one goal per project for now). A Project owns one or more Publications. Publications remain fully functional — they're just now scoped to a project.

See `hot-metal-v2-phase-1.md` for detailed Phase 1 plan.

---

## 2) New Data Model

### Core Entities

```
Goal
├── Strategy (AI-generated, user-editable)
│   ├── Target audience definition
│   ├── Content pillars / themes
│   ├── Channel mix (blog, LinkedIn, X, newsletter, etc.)
│   ├── Cadence per channel
│   └── KPIs / success metrics
├── Knowledge Base (goal-specific inputs)
│   ├── Personal Brand: interview transcripts, bio, expertise areas, opinions
│   ├── Product Exposure: product URL analysis, competitor landscape, market positioning
│   └── Sales: ICP definition, pain points, objection handling, case studies
├── Channels (replaces publications as the primary organizing concept)
│   ├── Publication (existing blog infra, now one channel type)
│   ├── LinkedIn (first-class, not just syndication)
│   ├── X / Twitter (first-class)
│   └── Newsletter (future)
└── Content Pipeline (existing scout → ideas → drafts → publish, now goal-aware)
```

### Knowledge Acquisition Per Goal Type

| Goal Type | Knowledge Sources | Gathering Method |
|-----------|------------------|-----------------|
| Personal Brand | User interview, writing samples, hot takes, expertise areas | Chat-based interview agent, URL analysis of existing content |
| Product Exposure | Product website, competitors, market trends, target audience | Automated URL crawling (content analyzer), competitive research agent |
| Increase Sales | ICP docs, case studies, objection handling, product features | Document upload + structured interview, CRM data (future) |
| Thought Leadership | Industry trends, published research, contrarian views | RSS monitoring (scout), user opinion interviews |

### Channel-Native Content

Content types become first-class per channel instead of "repurposed blog posts":

- **Blog**: Long-form articles, how-tos, deep dives (existing)
- **LinkedIn**: Text posts, link posts, carousels, articles (purpose-built, not syndication)
- **X/Twitter**: Tweets, threads, quote tweets (purpose-built)
- **Newsletter**: Curated digests, exclusive content (future)

A goal's content calendar might look like:
- Monday: LinkedIn carousel (product tip)
- Tuesday: X thread (industry take)
- Wednesday: Blog deep-dive article
- Thursday: LinkedIn text post (personal story)
- Friday: X engagement post

### Strategy as a Product Feature

When a user picks a goal and provides knowledge, the AI generates a **content strategy document**:
- Target audience definition
- Content pillars (3-5 themes)
- Channel recommendations with cadence
- Example topics per pillar per channel
- Success metrics to track

The user reviews and tweaks. This strategy guides the scout, the writer agent, and the content calendar.

---

## 3) What We Keep As-Is

- DAL + D1 infrastructure
- Writer agent (extends to be goal/strategy-aware)
- Content scout (extends to consider goal + strategy)
- Publication frontends + templates
- Auth (Clerk), billing (Paddle), notifications (Resend), analytics (PostHog)
- Content analyzer (becomes part of "product exposure" knowledge gathering)
- Public API (extends for new entities)
- Comments, RSS feeds, image generation

---

## 4) What Changes

- **Onboarding**: Goal selection → Knowledge gathering → Strategy generation → Channel setup
- **Publications**: Demoted to a "channel type" — still fully functional but not the top-level organizing concept
- **Scout**: Becomes strategy-aware (finds content opportunities aligned with goal + strategy, not just topic keywords)
- **Writer agent**: Gets richer context (goal, knowledge base, strategy, channel-specific constraints)
- **Content calendar**: Multi-channel view, not just blog schedule
- **Dashboard**: Goal progress + cross-channel metrics, not just publication list

---

## 5) Migration Path

No automatic migration for V1. Existing publications remain as-is. Users create new projects when ready. Future: "Import existing publication into a project" feature.

---

## 6) Build Phases

### Phase 1 — Goal + Strategy Data Model & Onboarding
**Goal:** New data layer + goal creation wizard. No changes to existing content pipeline yet.

- D1 migrations: `goals`, `goal_knowledge_items`, `strategies`, `channels` tables
- DAL domain files for new entities (CRUD)
- Goal type registry (personal_brand, product_exposure, sales, thought_leadership + generic)
- Goal creation wizard in web app:
  - Step 1: Pick goal type
  - Step 2: Knowledge gathering (varies by goal type — start with simple text inputs)
  - Step 3: AI generates strategy document
  - Step 4: Review + edit strategy
  - Step 5: Channel setup (create publication and/or connect social accounts)
- Wrap existing publications as channels under a default goal
- Dashboard shows goals instead of (or alongside) publications

### Phase 2 — Knowledge Acquisition Agents
**Goal:** Rich, goal-specific knowledge gathering that produces high-quality strategies.

- Interview agent (for personal brand): conversational flow that extracts expertise, opinions, style, audience
- URL analysis agent (for product exposure): extends content analyzer to extract product positioning, features, competitors
- Document ingestion (for sales): upload PDFs/docs, extract ICP, pain points, objections
- Knowledge base viewer/editor in the UI
- Strategy regeneration when knowledge base changes

### Phase 3 — Strategy-Aware Content Pipeline
**Goal:** Scout and writer agent use goal + strategy to produce better, more targeted content.

- Strategy-guided scout: content opportunities aligned with goal and content pillars
- Strategy-aware writer agent: knows the goal, audience, knowledge base, and channel constraints
- Multi-channel content calendar (replaces single-publication schedule)
- Content type selection per idea (blog post, LinkedIn post, X thread, etc.)

### Phase 4 — Channel-Native Content Creation
**Goal:** First-class creation and publishing for non-blog channels.

- LinkedIn post composer (purpose-built, not syndication from blog post)
- X thread composer (multi-tweet with preview)
- Channel-specific templates and constraints in the writer agent
- Cross-channel content scheduling
- Analytics per channel per goal

### Phase 5 — Goal Analytics & Optimization
**Goal:** Close the loop — measure outcomes and optimize strategy.

- Goal KPI dashboard (per goal type)
- Cross-channel performance metrics
- Strategy effectiveness scoring
- AI-driven strategy refinement suggestions based on performance data

---

## 7) Risks & Open Questions

1. **Scope explosion**: Phase 1 must be narrow enough to validate. Don't build full knowledge acquisition before proving the goal model works.
2. **Goal overlap**: Can users have multiple goals? Start with one-goal-at-a-time, extend later.
3. **Migration complexity**: Existing users need a smooth path. Auto-migration with a default goal is the plan.
4. **Strategy quality**: Generic AI strategies won't differentiate. The knowledge gathering phase is what makes strategies specific and valuable — this is the moat.
5. **LinkedIn/X as first-class channels**: This means building a proper social media scheduler, not just syndication. Significant product surface area — scope carefully.
6. **Goal types**: Start with 3-4 well-defined types. "Custom" goal type as escape hatch.
