import { Hono } from 'hono'
import type { PublisherEnv } from '../env'
import { buildAuthorizeUrl, exchangeCodeForToken, fetchPersonUrn } from '../linkedin/oauth'
import {
  LinkedInTokenStore,
  storeOAuthState,
  validateAndConsumeOAuthState,
} from '../linkedin/token-store'

const oauth = new Hono<{ Bindings: PublisherEnv }>()

/** Start LinkedIn OAuth flow — returns the authorize URL to open in a browser. */
oauth.get('/oauth/linkedin', async (c) => {
  const state = crypto.randomUUID()

  await storeOAuthState(c.env.PUBLISHER_DB, state)

  const authorizeUrl = buildAuthorizeUrl(
    c.env.LINKEDIN_CLIENT_ID,
    c.env.LINKEDIN_REDIRECT_URI,
    state,
  )

  return c.json({ authorizeUrl })
})

/** LinkedIn OAuth callback — exchanges code for token and stores it. */
oauth.get('/oauth/linkedin/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const error = c.req.query('error')

  if (error) {
    const description = c.req.query('error_description') || 'Unknown error'
    return c.json({ error: 'OAuth failed', detail: description }, 400)
  }

  if (!code || !state) {
    return c.json({ error: 'Missing code or state parameter' }, 400)
  }

  const validState = await validateAndConsumeOAuthState(c.env.PUBLISHER_DB, state)
  if (!validState) {
    return c.json({ error: 'Invalid or expired state parameter' }, 400)
  }

  const tokenResponse = await exchangeCodeForToken(
    c.env.LINKEDIN_CLIENT_ID,
    c.env.LINKEDIN_CLIENT_SECRET,
    code,
    c.env.LINKEDIN_REDIRECT_URI,
  )

  const personUrn = await fetchPersonUrn(tokenResponse.accessToken)

  const tokenStore = new LinkedInTokenStore(c.env.PUBLISHER_DB, c.env.TOKEN_ENCRYPTION_KEY)
  await tokenStore.storeToken(tokenResponse.accessToken, personUrn, tokenResponse.expiresIn)

  return c.json({
    status: 'connected',
    personUrn,
    expiresIn: tokenResponse.expiresIn,
  })
})

/** Check LinkedIn connection status. */
oauth.get('/oauth/linkedin/status', async (c) => {
  const tokenStore = new LinkedInTokenStore(c.env.PUBLISHER_DB, c.env.TOKEN_ENCRYPTION_KEY)
  const connected = await tokenStore.hasValidToken()

  return c.json({ connected })
})

export default oauth
