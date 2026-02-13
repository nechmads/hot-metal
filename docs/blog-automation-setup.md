# Blog Automation -- Setup & Testing Guide

## Architecture Overview

The blog automation system has 2 services working together:

```
web (port 5173) ---- API + WriterAgent DO + AI drafting
                \--> content-scout (port 8790)  Scout pipeline (via HTTP proxy or service binding)
```

- **web** -- React SPA + full CF Worker backend. Manages publications, topics, ideas, sessions, drafts, and hosts the WriterAgent Durable Object.
- **content-scout** -- Durable pipeline worker. Cron + Queue + Workflow. Discovers trending stories, generates ideas via LLM, stores to DAL, and optionally auto-writes via web's internal API.

Both services share the Data Access Layer (`hotmetal-data-layer`) via Service Bindings.

---

## Step 1: Install Dependencies

From the repo root:

```bash
pnpm install
```

---

## Step 2: Run DAL Migrations

```bash
cd services/data-layer
pnpm db:migrate:local
```

This creates all tables (sessions, publications, topics, ideas, etc.) in the local D1 SQLite.

---

## Step 3: Set Secrets for Local Development

### web secrets

```bash
cd apps/web

npx wrangler secret put CLERK_PUBLISHABLE_KEY --local
npx wrangler secret put CLERK_ISSUER --local
npx wrangler secret put ANTHROPIC_API_KEY --local    # Claude API key for AI drafting
npx wrangler secret put CMS_API_KEY --local          # CMS API key for publishing
npx wrangler secret put ALEXANDER_API_KEY --local    # Alexander API key for research
npx wrangler secret put SCOUT_API_KEY --local        # Must match API_KEY on content-scout
npx wrangler secret put INTERNAL_API_KEY --local     # Must match INTERNAL_API_KEY on content-scout
```

### content-scout secrets

```bash
cd services/content-scout

npx wrangler secret put API_KEY --local              # Authenticates incoming requests
npx wrangler secret put ALEXANDER_API_KEY --local    # Alexander API for trend search
npx wrangler secret put ANTHROPIC_API_KEY --local    # Claude API for idea generation
npx wrangler secret put INTERNAL_API_KEY --local     # Must match web's INTERNAL_API_KEY
```

> **Important**: `API_KEY` on content-scout must match `SCOUT_API_KEY` on web. `INTERNAL_API_KEY` must match between web and content-scout (used for auto-write pipeline).

---

## Step 4: Start Services

Open 2 terminal tabs:

**Tab 1 -- Web (port 5173)**
```bash
cd apps/web
pnpm dev
```

**Tab 2 -- Content Scout (port 8790)** (only needed for automation)
```bash
cd services/content-scout
pnpm dev
```

> Note: Queues and Workflows run locally in wrangler dev mode. The cron trigger fires immediately on startup in dev mode.

---

## Step 5: Verify Services Are Running

```bash
# Web
curl http://localhost:5173/health
# Expected: {"status":"ok","service":"hotmetal-web"}

# Content Scout
curl http://localhost:8790/health
# Expected: {"status":"ok","service":"content-scout"}
```

---

## Testing from the UI

### 1. Create a Publication

1. Open http://localhost:5173 in your browser
2. Click **Schedule** in the left sidebar
3. Click **Create Publication**
4. Fill in Name, Slug, Description
5. Click **Create**

### 2. Configure Publication Settings

1. Set **Auto-publish mode** (Draft / Publish / Full Auto)
2. Set **Writing Tone** (optional)
3. Set **Default Author**
4. If Full Auto, set **Posts per week** cadence
5. Click **Save Changes**

### 3. Add Topics

1. Click **Add Topic**
2. Fill in Name, Description, Priority
3. Add 2-3 topics for better results

### 4. Run the Content Scout

1. Click **Run Scout Now** in the publication settings
2. Wait 30-60 seconds for the scout workflow
3. On success, you'll see a toast notification

### 5. View Generated Ideas

1. Click **Ideas** in the left sidebar
2. Select your publication
3. Actions: **Promote** (creates writing session) or **Dismiss**

---

## End-to-End Test Sequence

1. Create a publication (UI or Postman)
2. Add 2-3 topics
3. Trigger the scout (`POST /api/publications/:id/scout`)
4. Wait 30-60 seconds
5. List ideas (`GET /api/publications/:id/ideas`) -- should have new ideas
6. Promote an idea (`POST /api/ideas/:id/promote`) -- creates a writing session
7. Open the UI, navigate to Writing -- session is pre-seeded with the idea context

---

## Production Deployment

1. **Deploy web**:
   ```bash
   cd apps/web
   npx wrangler deploy
   ```

2. **Set production secrets on web**:
   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put CMS_API_KEY
   npx wrangler secret put ALEXANDER_API_KEY
   npx wrangler secret put SCOUT_API_KEY
   npx wrangler secret put INTERNAL_API_KEY
   ```

3. **Deploy content-scout**:
   ```bash
   cd services/content-scout
   npx wrangler deploy
   ```

4. **Set production secrets on content-scout**:
   ```bash
   npx wrangler secret put API_KEY
   npx wrangler secret put ALEXANDER_API_KEY
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put INTERNAL_API_KEY
   ```

5. **CF Queue and DLQ**: Auto-created on first deploy.

6. **Cron**: The hourly cron trigger activates automatically on deploy.
