#!/usr/bin/env bash
#
# Seed the local D1 database with the first user from the Clerk instance.
# Requires: curl, jq, wrangler
#
# Usage: bash scripts/seed-dev-user.sh
#   (run from the repo root)

set -euo pipefail

for cmd in curl jq npx; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Error: '$cmd' is required but not installed."; exit 1; }
done

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEV_VARS="$REPO_ROOT/.dev.vars"

# ── Read CLERK_SECRET_KEY ───────────────────────────────────────────
if [[ ! -f "$DEV_VARS" ]]; then
  echo "Error: $DEV_VARS not found."
  echo "Create it with CLERK_SECRET_KEY=sk_test_... (see .dev.vars.example)"
  exit 1
fi

CLERK_SECRET_KEY=$(grep -E '^CLERK_SECRET_KEY=' "$DEV_VARS" | cut -d'=' -f2- | tr -d '"' | tr -d "'")

if [[ -z "$CLERK_SECRET_KEY" ]]; then
  echo "Error: CLERK_SECRET_KEY not found in $DEV_VARS"
  exit 1
fi

# ── Fetch first user from Clerk ─────────────────────────────────────
echo "Fetching users from Clerk..."

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $CLERK_SECRET_KEY" \
  "https://api.clerk.com/v1/users?limit=1&order_by=-created_at")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "Error: Clerk API returned HTTP $HTTP_CODE"
  echo "$BODY"
  exit 1
fi

USER_COUNT=$(echo "$BODY" | jq 'length')
if [[ "$USER_COUNT" -eq 0 ]]; then
  echo "Error: No users found in Clerk instance."
  echo "Create a user in the Clerk Dashboard first, then re-run this script."
  exit 1
fi

USER_ID=$(echo "$BODY" | jq -r '.[0].id')
EMAIL=$(echo "$BODY" | jq -r '.[0].email_addresses[0].email_address // empty')
FIRST_NAME=$(echo "$BODY" | jq -r '.[0].first_name // empty')
LAST_NAME=$(echo "$BODY" | jq -r '.[0].last_name // empty')
NAME="${FIRST_NAME}${LAST_NAME:+ $LAST_NAME}"

if [[ -z "$USER_ID" ]]; then
  echo "Error: Could not extract user ID from Clerk response."
  exit 1
fi

if [[ -z "$EMAIL" ]]; then
  EMAIL="${USER_ID}@placeholder.local"
fi

if [[ -z "$NAME" ]]; then
  NAME="Dev User"
fi

echo "Found Clerk user:"
echo "  ID:    $USER_ID"
echo "  Email: $EMAIL"
echo "  Name:  $NAME"

# ── Seed into local D1 ──────────────────────────────────────────────
escape_sql() { printf '%s' "$1" | sed "s/'/''/g"; }
SQL="INSERT OR REPLACE INTO users (id, email, name, created_at, updated_at) VALUES ('$(escape_sql "$USER_ID")', '$(escape_sql "$EMAIL")', '$(escape_sql "$NAME")', unixepoch(), unixepoch());"

echo "Seeding into local D1..."

cd "$REPO_ROOT/services/data-layer"
npx wrangler d1 execute DB --local --persist-to ../../.wrangler/shared-state --command "$SQL"

echo "Done! Dev user seeded into local D1."
