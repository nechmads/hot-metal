# Blog Automation — Setup & Testing Guide

## Architecture Overview

The blog automation system has 3 services working together:

```
writer-web (port 5173) --> writer-agent (port 8789)     REST API + AI agent
                       \-> content-scout (port 8790)     Scout pipeline
      UI proxy (BFF)
```

- **writer-web** — React SPA + thin CF Worker proxy (BFF). Routes `/api/*` requests to writer-agent and `/api/publications/:id/scout` directly to content-scout.
- **writer-agent** — Main backend. Manages publications, topics, ideas, sessions, drafts.
- **content-scout** — Durable pipeline worker. Cron + Queue + Workflow. Discovers trending stories, generates ideas via LLM, stores to D1, and optionally auto-writes.

All three services share the same D1 database (`hotmetal-writer-db`).

---

## Step 1: Install Dependencies

From the repo root:

```bash
pnpm install
```

This installs all workspace packages including `services/content-scout`.

---

## Step 2: Run D1 Migrations

The content-scout shares the writer-agent's D1 database. The automation tables (publications, topics, ideas) were added via migrations in the writer-agent service.

**If you haven't run migrations yet:**

```bash
cd services/writer-agent
npx wrangler d1 migrations apply hotmetal-writer-db --local
```

This creates the `publications`, `topics`, and `ideas` tables (among others) in the local D1 SQLite.

---

## Step 3: Set Secrets for Local Development

### writer-agent secrets

These should already be set if you've been developing the writer-agent. Confirm they exist:

```bash
cd services/writer-agent

# Required secrets (set if not already):
npx wrangler secret put WRITER_API_KEY --local     # API key for incoming requests
npx wrangler secret put ANTHROPIC_API_KEY --local   # Claude API key for AI drafting
npx wrangler secret put CMS_API_KEY --local         # CMS API key for publishing
npx wrangler secret put ALEXANDER_API_KEY --local   # Alexander API key for research
```

### content-scout secrets

```bash
cd services/content-scout

npx wrangler secret put API_KEY --local                # Authenticates incoming requests to this service
npx wrangler secret put ALEXANDER_API_KEY --local      # Alexander API for trend search
npx wrangler secret put ANTHROPIC_API_KEY --local      # Claude API for idea generation
npx wrangler secret put WRITER_AGENT_API_KEY --local   # Key to call writer-agent (for auto-write)
```

> **Important**: `API_KEY` on content-scout must match `SCOUT_API_KEY` on writer-web (writer-web sends it as a Bearer token). `WRITER_AGENT_API_KEY` on content-scout must match `WRITER_API_KEY` on writer-agent (content-scout uses it to call writer-agent for auto-write).

### writer-web secrets

```bash
cd apps/writer-web

npx wrangler secret put WRITER_API_KEY --local   # Same as writer-agent's WRITER_API_KEY
npx wrangler secret put SCOUT_API_KEY --local    # Must match API_KEY on content-scout
```

---

## Step 4: Start All Services

Open 3 terminal tabs:

**Tab 1 — Writer Agent (port 8789)**
```bash
cd services/writer-agent
pnpm dev
```

**Tab 2 — Content Scout (port 8790)**
```bash
cd services/content-scout
pnpm dev
```

> Note: Queues and Workflows run locally in wrangler dev mode. The cron trigger fires immediately on startup in dev mode (you can ignore it or let it run).

**Tab 3 — Writer Web (port 5173)**
```bash
cd apps/writer-web
pnpm dev
```

---

## Step 5: Verify Services Are Running

```bash
# Writer Agent
curl http://localhost:8789/health
# Expected: {"status":"ok","service":"writer-agent"}

# Content Scout
curl http://localhost:8790/health
# Expected: {"status":"ok","service":"content-scout"}

# Writer Web
curl http://localhost:5173/health
# Expected: {"status":"ok","service":"writer-web"}
```

---

## Testing from the UI

### 1. Create a Publication

1. Open http://localhost:5173 in your browser
2. Click **Schedule** in the left sidebar
3. Click **Create Publication** (or **New Publication** if others exist)
4. Fill in:
   - **Name**: e.g., "Looking Ahead"
   - **Slug**: auto-generated from name (e.g., "looking-ahead")
   - **Description**: optional
5. Click **Create**
6. You'll be redirected to the publication settings page

### 2. Configure Publication Settings

On the publication settings page:

1. Set **Auto-publish mode**:
   - **Draft** — Scout finds ideas, you decide what to write
   - **Publish** — Scout finds AND publishes the best idea each run
   - **Full Auto** — Scout publishes on your cadence
2. Set **Writing Tone** (optional): e.g., "conversational, slightly technical"
3. Set **Default Author**: e.g., "Shahar"
4. If Full Auto mode, set **Posts per week** cadence
5. Click **Save Changes**

### 3. Add Topics

Still on the publication settings page, scroll to the Topics section:

1. Click **Add Topic**
2. Fill in:
   - **Name**: e.g., "AI in Software Engineering"
   - **Description**: e.g., "How AI tools are changing how developers build software"
   - **Priority**: High (1), Medium (2), or Low (3)
3. Click **Create**
4. Add 2-3 more topics for better results

### 4. Run the Content Scout

1. In the publication settings page, find the **"Run Scout Now"** button (in the auto-publish section)
   - The button is disabled if you have no topics — add at least one first
2. Click **Run Scout Now**
3. The button shows a spinner while the scout runs
4. The scout pipeline takes 30-60 seconds (searches trends, generates ideas via LLM)
5. On success, you'll see a toast notification

### 5. View Generated Ideas

1. Click **Ideas** in the left sidebar
2. Select your publication from the dropdown
3. You should see the newly generated ideas with:
   - Title and angle
   - Source links
   - Relevance score
4. Click an idea to see full details
5. Actions:
   - **Promote** — creates a new writing session seeded with this idea
   - **Dismiss** — hides the idea

### 6. Check the Activity Timeline

1. Click **Schedule** in the left sidebar
2. Scroll down to **Recent Activity**
3. You should see any writing sessions and published posts grouped by date

---

## Testing with Postman

### Import Collections

Import these files from the `postman/` directory:

1. `Hot_Metal_Writer_Agent.postman_collection.json` — All writer-agent endpoints
2. `Hot_Metal_Content_Scout.postman_collection.json` — Content scout endpoints
3. `Hot_Metal_Local.postman_environment.json` — Local dev environment variables

### Set Environment Variables

1. Select **Hot Metal -- Local Development** environment
2. Set these values:
   - `WRITER_BASE_URL`: `http://localhost:8789`
   - `WRITER_API_KEY`: your local writer API key
   - `SCOUT_BASE_URL`: `http://localhost:8790`
   - `SCOUT_API_KEY`: your local scout API key (same as WRITER_AGENT_API_KEY on scout)

### Test Flow: Publications

**Writer Agent collection > Publications folder:**

1. **Create Publication** — `POST {{WRITER_BASE_URL}}/api/publications`
   - Auto-sets `publicationId` collection variable from response
2. **Get Publication** — `GET {{WRITER_BASE_URL}}/api/publications/{{publicationId}}`
3. **Update Publication** — `PATCH {{WRITER_BASE_URL}}/api/publications/{{publicationId}}`
4. **List Publications** — `GET {{WRITER_BASE_URL}}/api/publications`

### Test Flow: Topics

**Writer Agent collection > Topics folder:**

1. **Create Topic** — `POST {{WRITER_BASE_URL}}/api/publications/{{publicationId}}/topics`
   - Auto-sets `topicId` collection variable from response
2. **List Topics** — `GET {{WRITER_BASE_URL}}/api/publications/{{publicationId}}/topics`
3. **Update Topic** — `PATCH {{WRITER_BASE_URL}}/api/topics/{{topicId}}`
4. **Delete Topic** — `DELETE {{WRITER_BASE_URL}}/api/topics/{{topicId}}`

### Test Flow: Scout Trigger

**Option A — via Writer Agent (proxy):**

**Writer Agent collection > Scout folder:**

- **Trigger Scout** — `POST {{WRITER_BASE_URL}}/api/publications/{{publicationId}}/scout`
  - This proxies to the content-scout service
  - Requires writer-agent API key

**Option B — Direct to Content Scout:**

**Content Scout collection > Scout Triggers folder:**

- **Run Scout -- Single Publication** — `POST {{SCOUT_BASE_URL}}/api/scout/run`
  - Body: `{ "publicationId": "<uuid>" }`
  - Uses Bearer auth with SCOUT_API_KEY

- **Run Scout -- All Publications** — `POST {{SCOUT_BASE_URL}}/api/scout/run-all`
  - No body needed

### Test Flow: Ideas

**Writer Agent collection > Ideas folder:**

1. **List Ideas** — `GET {{WRITER_BASE_URL}}/api/publications/{{publicationId}}/ideas`
   - Optional filter: `?status=new`
2. **Get Idea** — `GET {{WRITER_BASE_URL}}/api/ideas/{{ideaId}}`
3. **Update Idea Status** — `PATCH {{WRITER_BASE_URL}}/api/ideas/{{ideaId}}`
   - Body: `{ "status": "reviewed" }` or `{ "status": "dismissed" }`
4. **Promote Idea** — `POST {{WRITER_BASE_URL}}/api/ideas/{{ideaId}}/promote`
   - Creates a new writing session seeded with the idea

### Test Flow: Activity

**Writer Agent collection > Activity folder:**

- **Recent Activity** — `GET {{WRITER_BASE_URL}}/api/activity?days=30`
  - Returns sessions grouped by date for the content calendar

---

## End-to-End Test Sequence

Here's a full happy-path test:

1. Create a publication (Postman or UI)
2. Add 2-3 topics to the publication
3. Trigger the scout (`POST /api/publications/:id/scout`)
4. Wait 30-60 seconds for the scout workflow to complete
5. List ideas (`GET /api/publications/:id/ideas`) — should have new ideas
6. Promote an idea (`POST /api/ideas/:id/promote`) — creates a writing session
7. Open the UI, navigate to Writing — you should see the new session
8. The session chat is pre-seeded with the idea context

---

## Production Deployment

For production, you'll need to:

1. **Deploy content-scout**:
   ```bash
   cd services/content-scout
   npx wrangler deploy
   ```

2. **Set production secrets on content-scout**:
   ```bash
   npx wrangler secret put API_KEY
   npx wrangler secret put ALEXANDER_API_KEY
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put WRITER_AGENT_API_KEY
   ```

3. **Set production secrets on writer-web** (the new one):
   ```bash
   cd apps/writer-web
   npx wrangler secret put SCOUT_API_KEY
   ```

4. **Update writer-web production vars** in wrangler.jsonc:
   - Change `CONTENT_SCOUT_URL` from `http://localhost:8790` to `https://hotmetal-content-scout.shahar-nechmad.workers.dev`

5. **Redeploy writer-web**:
   ```bash
   npx wrangler deploy
   ```

6. **CF Queue and DLQ**: The queue `hotmetal-scout-queue` and DLQ `hotmetal-scout-dlq` are auto-created on first deploy.

7. **Cron**: The cron trigger (`0 7 * * *` UTC) activates automatically on deploy.
