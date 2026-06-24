/**
 * Flag an existing local publication to use EmDash as its CMS provider.
 *
 * Encrypts the ec_pat_ token with the SAME TOKEN_ENCRYPTION_KEY the data layer
 * uses (read from services/data-layer/.dev.vars), then writes cms_provider,
 * cms_base_url, cms_token (encrypted) and cms_provisioning_status='ready' onto
 * the publication in the shared local D1 — so the write path routes that
 * publication's posts to EmDash instead of SonicJS.
 *
 * Usage (from repo root):
 *   PUB_SLUG=my-pub \
 *   PAT=ec_pat_... \
 *   BASE_URL=http://localhost:4321 \
 *   pnpm tsx scripts/flag-emdash-publication.ts
 *
 * (PUB_ID may be used instead of PUB_SLUG.)
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { encryptSecret } from '../services/data-layer/src/crypto'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dalDir = resolve(repoRoot, 'services/data-layer')

const PAT = process.env.PAT
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4321'
const PUB_SLUG = process.env.PUB_SLUG
const PUB_ID = process.env.PUB_ID

if (!PAT) {
  console.error('✗ Set PAT=ec_pat_... (mint one via ../emdash-spike/src/seed-live-d1.ts).')
  process.exit(2)
}
if (!PUB_SLUG && !PUB_ID) {
  console.error('✗ Set PUB_SLUG=<slug> (or PUB_ID=<id>) of the publication to flag.')
  process.exit(2)
}

function readEncryptionKey(): string {
  const raw = readFileSync(resolve(dalDir, '.dev.vars'), 'utf8')
  const line = raw.split('\n').find((l) => l.trim().startsWith('TOKEN_ENCRYPTION_KEY'))
  if (!line) throw new Error('TOKEN_ENCRYPTION_KEY not found in services/data-layer/.dev.vars')
  const value = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
  if (!value) throw new Error('TOKEN_ENCRYPTION_KEY is empty')
  return value
}

function wranglerExec(sql: string): void {
  // Run against the shared local D1 (same DB binding + persist path the DAL uses).
  execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', '../../.wrangler/shared-state', '--command', sql],
    { cwd: dalDir, stdio: 'inherit' },
  )
}

async function main() {
  const key = readEncryptionKey()
  const encrypted = await encryptSecret(PAT!, key)

  const where = PUB_ID ? `id = '${PUB_ID}'` : `slug = '${PUB_SLUG}'`
  // Values are safe to inline: encrypted token is hex:hex, base_url is a URL,
  // slug/id are app-generated identifiers — none contain quotes.
  const sql = `UPDATE publications SET cms_provider = 'emdash', cms_base_url = '${BASE_URL}', cms_token = '${encrypted}', cms_provisioning_status = 'ready' WHERE ${where};`

  console.log(`Flagging publication (${where}) → EmDash at ${BASE_URL}`)
  wranglerExec(sql)

  // Confirm.
  wranglerExec(
    `SELECT id, slug, cms_provider, cms_base_url, cms_provisioning_status FROM publications WHERE ${where};`,
  )
  console.log('\n✅ Done. New writing-session publishes for this publication now go to EmDash.')
  console.log('   To revert: set cms_provider back to sonicjs:')
  console.log(`   UPDATE publications SET cms_provider='sonicjs', cms_base_url=NULL, cms_token=NULL WHERE ${where};`)
}

main().catch((e) => {
  console.error('✗ flag-emdash-publication error:', e)
  process.exit(1)
})
