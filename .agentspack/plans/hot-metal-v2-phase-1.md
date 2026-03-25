# Hot Metal V2 — Phase 1: Projects, Goals & Strategy

**Owner:** Shahar
**Created:** 2026-03-25
**Status:** Planning
**Parent plan:** `hot-metal-v2.md`
**Branch pattern:** feature branches off `hot-metal-v2`

---

## Overview

Introduce **Project** as the new top-level entity in Hot Metal. A Project has a goal (what the user wants to achieve), knowledge (inputs about the user/product), a strategy (AI-generated content plan), and one or more publications.

Phase 1 focuses on:
- Data model for projects, knowledge, and strategies
- Project creation wizard with goal-specific knowledge gathering
- AI strategy generation
- Publication creation as part of the project setup
- New dashboard centered on projects

Phase 1 does **not** change the existing content pipeline (scout, writer agent, publishing). Those continue working at the publication level as before.

---

## 1. The "Project" Entity

A Project is the new top-level container that gives purpose and direction to everything underneath it.

### Structure

```
User
└── Projects (1 or more)
    ├── Goal (type: personal_brand | product_awareness)
    ├── Knowledge Items (collected during wizard, editable later)
    ├── Strategy (AI-generated, user-editable, regenerable)
    └── Publications (1 or more, created during setup or imported later)
```

### Key Decisions

- A project has exactly **one goal** (for now; multi-goal is a future extension)
- A project can have **multiple publications** (e.g., a personal brand might have a main blog + a newsletter-style publication)
- Publications still work exactly as they do today — they just now belong to a project
- Social connections (LinkedIn, X) remain at the **user level**, not the project level (a user connects their LinkedIn once, then can use it across projects)

---

## 2. Goal Types (V1)

We start with two goal types. More will be added later (sales, thought leadership, custom/just write).

### Personal Brand

**Label:** "Build My Personal Brand"
**Description:** Become recognized as an expert in your field. Create content that showcases your knowledge, perspective, and unique voice.
**Icon:** User/person with star or spotlight

### Product Awareness

**Label:** "Build Awareness for a Product"
**Description:** Get your product in front of the right audience. Create content that educates, demonstrates value, and drives interest.
**Icon:** Megaphone or rocket

---

## 3. Project Creation Wizard

### Step 1: Name Your Project

- Project name (free text, required)
  - Placeholder examples: "My AI Thought Leadership", "Acme SaaS Launch"
- This is lightweight — just give the project an identity before diving into the goal

### Step 2: What's Your Goal?

- Two cards to choose from:
  - **Build My Personal Brand** — with short description
  - **Build Awareness for a Product** — with short description
- Single selection, required
- Sets the context for Step 3

### Step 3: Tell Us More (Knowledge Gathering)

Fields adapt based on the goal type selected in Step 2. We store each answer as a knowledge item.

#### Personal Brand Fields

| Field | Required? | Purpose |
|-------|-----------|---------|
| Your name | Yes (pre-filled from Clerk) | Attribution, voice personalization |
| Your role / title | Yes | Establishes authority angle |
| Area of expertise | Yes | Core topic direction ("AI in healthcare", "frontend architecture", "startup growth") |
| Target audience | Yes | Who should read your content ("CTOs at mid-size companies", "junior developers", "startup founders") |
| What makes your perspective unique? | Yes | The differentiator — why should people listen to you specifically |
| Topics you're passionate about | No | Helps generate content pillars — comma-separated or tags |
| Existing website or LinkedIn URL | No | For future analysis (Phase 2); stored but not processed yet |

#### Product Awareness Fields

| Field | Required? | Purpose |
|-------|-----------|---------|
| Product name | Yes | Core subject of all content |
| Product URL | Yes | For future automated research (Phase 2); stored for now |
| What does it do? (one-liner) | Yes | Elevator pitch, used in strategy |
| Target audience | No | Who's the product for; AI can infer from URL later |
| Top competitors | No | Names or URLs; helps differentiate; AI can research later |
| What makes it different? | No | Key differentiators; AI can extract from URL later |
| Key features or use cases | No | Helps generate content angles; AI can extract later |

**Design note:** For product awareness, we intentionally make most fields optional. The product URL is the anchor — in Phase 2 we'll crawl it and auto-fill gaps. For now, whatever the user provides (even just name + URL + one-liner) is enough to generate a reasonable strategy.

### Step 4: Your Content Strategy

This is the high-value moment. The AI generates a full content strategy based on the knowledge provided.

**What the user sees:**

A structured, readable strategy document with these sections:

1. **Target Audience**
   - Who we're creating content for
   - Their pain points, interests, where they hang out online
   - 1-2 paragraphs

2. **Content Pillars** (3-5)
   - Each pillar has:
     - Name (e.g., "AI Engineering Best Practices")
     - Description (1-2 sentences)
     - 3-4 example article topics
   - These map roughly to what "topics" are today, but more strategic

3. **Recommended Channels**
   - Which channels to use and why
   - Suggested posting cadence per channel
   - e.g., "Blog: 2 long-form posts/week — your expertise lends itself to deep dives"
   - e.g., "LinkedIn: 3 posts/week — your audience (CTOs) is highly active here"

4. **Tone & Voice**
   - Suggested writing style based on goal + audience
   - e.g., "Authoritative but approachable. Use first-person. Back claims with data. Avoid jargon unless your audience expects it."

5. **Sample Week**
   - A concrete example week of content:
     - Monday: LinkedIn post — share a quick lesson from your experience with [pillar 1]
     - Tuesday: Blog article — deep dive into [pillar 2 example topic]
     - Wednesday: X thread — react to a trending topic in [pillar 3]
     - etc.

**User actions on this step:**
- **Edit**: Click into any section to modify the text inline (or in a modal)
- **Regenerate**: "Generate a new strategy" button — replaces the current one (previous version is saved)
- **Next**: Accept and proceed

**Strategy generation prompt inputs:**
- Goal type
- All knowledge items from Step 3
- (In the future: analyzed URL data, interview transcripts, etc.)

### Step 5: Set Up Your First Publication

The strategy recommended channels. Now we set them up. For Phase 1, we focus on **creating a publication** (blog). Social channels are already connected at the user level.

- **Publication name**: Pre-filled suggestion based on project name/goal (editable)
- **Publication slug**: Auto-derived from name (editable, with validation)
- **Template**: Pick from existing templates (Starter, Editorial, Bold) — show previews
- **Writing style**: Pick from existing prebuilt styles or "Let AI pick based on your strategy" (creates a new style from the tone & voice section)

**Optional section — Social Channels:**
- If user has LinkedIn connected: "Use LinkedIn for this project?" toggle
- If user has X connected: "Use X for this project?" toggle
- If neither connected: "Connect LinkedIn" / "Connect X" links (existing OAuth flows)
- These are informational for now — they don't change how publishing works yet (syndication is already per-publish-action)

### Step 6: All Set

Summary of what was created:
- Project name, goal type
- Strategy highlights (pillars, channels)
- Publication created (with link)

CTAs:
- **"Start Writing"** — creates a new writing session in this project's publication, navigates to workspace
- **"Run Content Scout"** — triggers scout for the publication, shows polling state
- **"View Your Strategy"** — navigates to the project home page

---

## 4. Strategy Data Model

### Stored Fields

```
Strategy:
  id: string (uuid)
  projectId: string (FK → projects)
  version: number (increments on regenerate)
  targetAudience: text
  contentPillars: JSON array of { name, description, exampleTopics[] }
  recommendedChannels: JSON array of { type, cadence, rationale }
  toneAndVoice: text
  sampleWeek: JSON array of { dayOfWeek, channel, contentType, topicIdea }
  fullMarkdown: text (the complete rendered strategy as readable markdown)
  generatedAt: datetime
  editedAt: datetime (null if never edited)
  isActive: boolean (true for current version, false for previous)
```

**Why both structured fields AND fullMarkdown?**
- Structured fields: machine-readable, so the scout/writer can use specific pillars, audience, tone in later phases
- fullMarkdown: what the user sees and edits in the strategy view — the "source of truth" for human consumption
- When the user edits, we update fullMarkdown. Structured fields are updated on regeneration only (or we parse edits — TBD)

### Strategy Generation

- Uses Claude (Sonnet or Opus) with a specialized prompt
- Inputs: goal type, all knowledge items, any existing strategy (for regeneration)
- Output: structured JSON matching the fields above + a rendered markdown version
- Temperature slightly elevated for creativity
- The prompt should vary by goal type to produce genuinely different strategies

### Strategy Versioning

- Each regeneration creates a new row with `version++` and sets `isActive = true` on the new one, `false` on the old
- User can view previous versions (read-only) — simple dropdown: "Version 1 (Mar 25)", "Version 2 (Mar 28)"
- User edits to fullMarkdown update in-place (no new version) with `editedAt` timestamp

---

## 5. Project Home Page

New route: `/projects/:id`

### Layout

**Header area:**
- Project name (editable inline)
- Goal type badge ("Personal Brand" / "Product Awareness")
- "View Strategy" button → opens strategy viewer/editor

**Strategy summary card:**
- Content pillars as tags/chips
- Recommended cadence: "Blog: 2/week · LinkedIn: 3/week · X: daily"
- "Edit Strategy" link

**Publications section:**
- List of publications in this project (cards, same style as current dashboard)
- Each card shows: name, slug, post count, latest activity
- Click → goes to existing publication home page (`/publications/:id`)
- "Add Publication" button (opens a simpler modal — just name/slug/template, since strategy already exists)
- Future: "Import Existing Publication" button

**Quick Actions:**
- "Start Writing" — opens session creation (scoped to this project's publications)
- "Run Content Scout" — triggers scout for all publications in this project
- "View Ideas" — navigates to ideas page filtered by this project's publications

---

## 6. Dashboard Changes

### New Dashboard Layout

**If no projects exist (new user):**
- Welcome message
- Hero card: "Start Your First Content Project"
- Brief explanation of what a project is
- Big CTA button → opens project creation wizard

**If projects exist:**
- **Project cards** (one per project):
  - Project name + goal type icon/badge
  - Strategy summary (pillars as tags, one-line audience description)
  - Publications count + total posts published
  - Recent activity (latest published post, latest idea, etc.)
  - Click → project home page
- **"New Project"** button
- **Quick Actions row** (similar to current, but project-aware):
  - "Start Writing" (if 1 project, goes directly; if multiple, shows picker)
  - "View Ideas" (aggregated or with project filter)

### Sidebar Changes

Current sidebar:
```
Dashboard
Writing
Ideas
Styles
[Publication sub-pages]
Settings
```

New sidebar:
```
Dashboard
Projects
  └── [Project Name 1]
  └── [Project Name 2]
  └── + New Project
Writing (all sessions, filterable by project)
Ideas (all ideas, filterable by project)
Styles
Settings
```

If user has only 1 project, the Projects section can be collapsed/simplified to avoid unnecessary nesting.

---

## 7. Data Model — D1 Tables

### New Tables

**`projects`**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | uuid |
| user_id | TEXT NOT NULL | FK → users |
| name | TEXT NOT NULL | User-chosen project name |
| goal_type | TEXT NOT NULL | 'personal_brand' \| 'product_awareness' |
| status | TEXT NOT NULL DEFAULT 'active' | 'active' \| 'archived' |
| created_at | TEXT NOT NULL | ISO datetime |
| updated_at | TEXT NOT NULL | ISO datetime |

**`project_knowledge`**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | uuid |
| project_id | TEXT NOT NULL | FK → projects |
| field_key | TEXT NOT NULL | e.g., 'expertise_area', 'product_url', 'target_audience' |
| field_value | TEXT NOT NULL | The user's input |
| created_at | TEXT NOT NULL | ISO datetime |
| updated_at | TEXT NOT NULL | ISO datetime |

**`strategies`**
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | uuid |
| project_id | TEXT NOT NULL | FK → projects |
| version | INTEGER NOT NULL DEFAULT 1 | Increments on regenerate |
| target_audience | TEXT | Structured field |
| content_pillars | TEXT | JSON array |
| recommended_channels | TEXT | JSON array |
| tone_and_voice | TEXT | Structured field |
| sample_week | TEXT | JSON array |
| full_markdown | TEXT NOT NULL | Rendered strategy doc |
| is_active | INTEGER NOT NULL DEFAULT 1 | 1 = current version |
| generated_at | TEXT NOT NULL | ISO datetime |
| edited_at | TEXT | NULL if never edited |

### Modified Tables

**`publications`** — add column:
| Column | Type | Notes |
|--------|------|-------|
| project_id | TEXT | FK → projects, nullable for backward compatibility |

---

## 8. DAL Domain Files

New domain files in `services/data-layer/src/domains/`:

- **`projects.ts`** — CRUD for projects (create, get, list by user, update, archive)
- **`project-knowledge.ts`** — CRUD for knowledge items (create/upsert batch, list by project, update, delete)
- **`strategies.ts`** — Create, get active by project, list versions by project, update (edit), deactivate old + create new (regenerate)

Modified:
- **`publications.ts`** — Add `projectId` to create input and query filters. Add `listByProject(projectId)` method.

---

## 9. API Routes (writer-web backend)

### Project Routes (`/api/projects`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List user's projects |
| POST | `/api/projects` | Create project (name, goalType) |
| GET | `/api/projects/:id` | Get project details |
| PATCH | `/api/projects/:id` | Update project (name, status) |

### Knowledge Routes (`/api/projects/:id/knowledge`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:id/knowledge` | List knowledge items for project |
| PUT | `/api/projects/:id/knowledge` | Batch upsert knowledge items (from wizard) |

### Strategy Routes (`/api/projects/:id/strategy`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:id/strategy` | Get active strategy |
| POST | `/api/projects/:id/strategy/generate` | Generate (or regenerate) strategy from knowledge |
| PATCH | `/api/projects/:id/strategy` | Update strategy (user edits to fullMarkdown) |
| GET | `/api/projects/:id/strategy/versions` | List all strategy versions |
| GET | `/api/projects/:id/strategy/versions/:version` | Get specific version |

### Publication Changes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/projects/:id/publications` | Create publication within project |
| GET | `/api/projects/:id/publications` | List publications in project |

Existing publication routes continue to work unchanged.

---

## 10. Frontend Pages & Components

### New Pages

| Route | Page | Description |
|-------|------|-------------|
| `/projects/new` | ProjectWizard | 6-step wizard (name → goal → knowledge → strategy → publication → done) |
| `/projects/:id` | ProjectHomePage | Project overview with strategy summary, publications, quick actions |
| `/projects/:id/strategy` | StrategyPage | Full strategy viewer/editor with version history |

### New Components

| Component | Description |
|-----------|-------------|
| `ProjectWizard` | Multi-step wizard container (similar pattern to existing PublicationWizard) |
| `WizardStepName` | Step 1: project name input |
| `WizardStepGoal` | Step 2: goal type selection cards |
| `WizardStepKnowledge` | Step 3: dynamic form based on goal type |
| `WizardStepStrategy` | Step 4: strategy display with edit/regenerate |
| `WizardStepPublication` | Step 5: publication creation form |
| `WizardStepComplete` | Step 6: summary + CTAs |
| `ProjectCard` | Dashboard card for a project |
| `StrategyViewer` | Renders strategy markdown with section headers |
| `StrategyEditor` | Editable version of the strategy (textarea or rich editor per section) |
| `StrategyVersionPicker` | Dropdown to switch between strategy versions |
| `GoalTypeBadge` | Small badge/chip showing goal type with icon |

### Modified Components

| Component | Change |
|-----------|--------|
| `DashboardPage` | Show project cards instead of (or alongside) publication cards |
| `Sidebar` | Add Projects section with sub-items per project |
| `NewSessionModal` | Add project/publication picker if user has multiple projects |

---

## 11. Strategy Generation (AI)

### Prompt Design

The strategy generation endpoint calls Claude with a goal-type-specific system prompt and the user's knowledge items.

**System prompt structure:**
```
You are a content strategist. Based on the user's goal and background,
create a comprehensive content strategy.

Goal type: {personal_brand | product_awareness}
[Goal-type-specific instructions]

Output format: JSON with these fields:
- targetAudience (2-3 paragraphs)
- contentPillars (array of 3-5 objects)
- recommendedChannels (array)
- toneAndVoice (2-3 paragraphs)
- sampleWeek (array of 5-7 entries)
- fullMarkdown (complete strategy as readable markdown)
```

**Goal-specific prompt variations:**

*Personal Brand:*
- Emphasize the person's unique perspective and expertise
- Recommend channels where thought leaders thrive (LinkedIn heavily, blog for depth, X for reach)
- Content pillars should reflect the person's expertise + audience interests
- Tone should be authentic and personal

*Product Awareness:*
- Emphasize educational content that demonstrates the product's value without being salesy
- Focus on the audience's problems, not the product's features
- Recommend channels based on where the target audience hangs out
- Content pillars should cover: product use cases, industry trends, customer stories, technical deep dives
- Tone should be professional but not corporate

### Model Choice

- Use Claude Sonnet for strategy generation (good balance of quality and cost)
- Can upgrade to Opus for paying users in the future

---

## 12. What Phase 1 Does NOT Include

Explicit scope boundaries to prevent creep:

- **No interview agent** — knowledge gathering is text fields only
- **No URL crawling/analysis** — URLs are stored but not processed
- **No strategy-aware scout** — scout still uses publication topics as before
- **No strategy-aware writer agent** — writer still works the same
- **No channel-native LinkedIn/X composer** — still existing syndication flow
- **No goal analytics / KPI tracking**
- **No multi-channel content calendar**
- **No existing user migration** — existing publications remain as-is; users create new projects when ready
- **No "import existing publication"** — future feature

---

## 13. Build Sequence

Suggested order for implementation:

1. **D1 migration + DAL domain files** — projects, project_knowledge, strategies tables; add project_id to publications
2. **API routes** — project CRUD, knowledge CRUD, strategy CRUD, publication-in-project creation
3. **Strategy generation endpoint** — AI prompt, structured output parsing, versioning
4. **Project creation wizard (frontend)** — 6-step wizard with all the forms
5. **Project home page (frontend)** — overview page with strategy summary and publications
6. **Strategy viewer/editor page (frontend)** — full strategy display with edit and version history
7. **Dashboard redesign** — project cards, new empty state, sidebar updates
8. **Polish & review** — test full flow end to end, edge cases, error states
