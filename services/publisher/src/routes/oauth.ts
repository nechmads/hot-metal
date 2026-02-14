import { Hono } from 'hono'
import type { PublisherEnv } from '../env'
import { buildAuthorizeUrl, exchangeCodeForToken, fetchPersonUrn } from '../linkedin/oauth'
import {
  storeLinkedInToken,
  hasValidLinkedInToken,
  storeOAuthState,
  validateAndConsumeOAuthState,
} from '../linkedin/token-store'
import { publisherApiKeyAuth } from '../middleware/api-key-auth'

const oauth = new Hono<{ Bindings: PublisherEnv }>()

// Protect non-callback OAuth routes with API key auth
// (callback is called by LinkedIn directly, so it can't have API key auth)
oauth.use('/oauth/linkedin', publisherApiKeyAuth)
oauth.use('/oauth/linkedin/status', publisherApiKeyAuth)

/** Start LinkedIn OAuth flow — returns the authorize URL to open in a browser. */
oauth.get('/oauth/linkedin', async (c) => {
  const userId = c.req.query('userId')
  if (!userId) {
    return c.json({ error: 'userId query param is required' }, 400)
  }

  const state = crypto.randomUUID()

  await storeOAuthState(c.env.DAL, state, userId)

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
    const description = (c.req.query('error_description') || 'Unknown error').slice(0, 200)
    // Redirect to web app with error
    if (c.env.WEB_APP_URL) {
      return c.redirect(`${c.env.WEB_APP_URL}/settings?error=${encodeURIComponent(description)}`)
    }
    return c.json({ error: 'OAuth failed', detail: description }, 400)
  }

  if (!code || !state) {
    if (c.env.WEB_APP_URL) {
      return c.redirect(`${c.env.WEB_APP_URL}/settings?error=${encodeURIComponent('Missing code or state parameter')}`)
    }
    return c.json({ error: 'Missing code or state parameter' }, 400)
  }

  const stateResult = await validateAndConsumeOAuthState(c.env.DAL, state)
  if (!stateResult.valid || !stateResult.userId) {
    if (c.env.WEB_APP_URL) {
      return c.redirect(`${c.env.WEB_APP_URL}/settings?error=${encodeURIComponent('Invalid or expired state parameter')}`)
    }
    return c.json({ error: 'Invalid or expired state parameter' }, 400)
  }

  try {
    const tokenResponse = await exchangeCodeForToken(
      c.env.LINKEDIN_CLIENT_ID,
      c.env.LINKEDIN_CLIENT_SECRET,
      code,
      c.env.LINKEDIN_REDIRECT_URI,
    )

    const personUrn = await fetchPersonUrn(tokenResponse.accessToken)

    await storeLinkedInToken(c.env.DAL, stateResult.userId, tokenResponse.accessToken, personUrn, tokenResponse.expiresIn)
  } catch (err) {
    console.error('OAuth token exchange failed:', err)
    if (c.env.WEB_APP_URL) {
      return c.redirect(`${c.env.WEB_APP_URL}/settings?error=${encodeURIComponent('Failed to complete LinkedIn connection. Please try again.')}`)
    }
    return c.json({ error: 'Token exchange failed' }, 500)
  }

  // Redirect back to web app settings page with success indicator
  if (c.env.WEB_APP_URL) {
    return c.redirect(`${c.env.WEB_APP_URL}/settings?connected=linkedin`)
  }

  return c.json({ status: 'connected' })
})

/** Check LinkedIn connection status. */
oauth.get('/oauth/linkedin/status', async (c) => {
  const userId = c.req.query('userId')
  if (!userId) {
    return c.json({ error: 'userId query param is required' }, 400)
  }

  const connected = await hasValidLinkedInToken(c.env.DAL, userId)

  return c.json({ connected })
})

export default oauth
