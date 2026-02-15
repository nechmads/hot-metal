/**
 * Twitter token and OAuth state management via the Data Access Layer.
 * Encryption is handled internally by the DAL service.
 *
 * Unlike LinkedIn, Twitter provides refresh tokens. Access tokens expire
 * in ~2 hours, so we transparently refresh them at publish time.
 */

import type { DataLayerApi, OAuthStateResult } from '@hotmetal/data-layer'
import { refreshAccessToken } from './oauth'

// ─── Token management ────────────────────────────────────────────────

export async function storeTwitterToken(
  dal: DataLayerApi,
  userId: string,
  accessToken: string,
  refreshToken: string,
  twitterUserId: string,
  twitterUsername: string,
  expiresIn: number,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)

  // Find any existing Twitter connection before creating the new one
  const connections = await dal.getSocialConnectionsByUser(userId)
  const existing = connections.find((c) => c.provider === 'twitter')

  // Create the new connection first (DAL encrypts tokens internally).
  // If we crash between create and delete, we have a recoverable duplicate
  // rather than zero connections (data loss).
  await dal.createSocialConnection({
    userId,
    provider: 'twitter',
    accessToken,
    refreshToken,
    externalId: twitterUserId,
    displayName: twitterUsername,
    tokenExpiresAt: now + expiresIn,
    scopes: 'tweet.read tweet.write users.read offline.access',
  })

  // Remove the old connection after the new one is safely stored
  if (existing) {
    try {
      await dal.deleteSocialConnection(existing.id)
    } catch (err) {
      console.error(`Failed to delete old Twitter connection ${existing.id}, duplicate may exist:`, err)
    }
  }
}

export async function getValidTwitterToken(
  dal: DataLayerApi,
  userId: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; twitterUserId: string; username: string } | null> {
  const connections = await dal.getSocialConnectionsByUser(userId)
  const twitter = connections.find((c) => c.provider === 'twitter')
  if (!twitter) return null

  const decrypted = await dal.getSocialConnectionWithDecryptedTokens(twitter.id)
  if (!decrypted?.accessToken || !decrypted.externalId) return null

  const now = Math.floor(Date.now() / 1000)
  const isNearExpiry = decrypted.tokenExpiresAt !== null && decrypted.tokenExpiresAt <= now + 300

  // Auto-refresh if expired or near-expiry (5 min buffer)
  if (isNearExpiry) {
    if (!decrypted.refreshToken) return null

    try {
      const refreshed = await refreshAccessToken(clientId, clientSecret, decrypted.refreshToken)
      await dal.updateSocialConnectionTokens(twitter.id, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        tokenExpiresAt: now + refreshed.expiresIn,
      })
      return {
        accessToken: refreshed.accessToken,
        twitterUserId: decrypted.externalId,
        username: decrypted.displayName ?? '',
      }
    } catch (err) {
      console.error('Twitter token refresh failed:', err)
      return null
    }
  }

  return {
    accessToken: decrypted.accessToken,
    twitterUserId: decrypted.externalId,
    username: decrypted.displayName ?? '',
  }
}

export async function hasValidTwitterToken(dal: DataLayerApi, userId: string): Promise<boolean> {
  return dal.hasValidSocialConnection(userId, 'twitter')
}

// ─── OAuth state management ──────────────────────────────────────────

export async function storeOAuthState(
  dal: DataLayerApi,
  state: string,
  userId: string,
  codeVerifier: string,
  ttlSeconds?: number,
): Promise<void> {
  const metadata = JSON.stringify({ codeVerifier })
  await dal.storeOAuthState(state, 'twitter', ttlSeconds, userId, metadata)
}

export async function validateAndConsumeOAuthState(
  dal: DataLayerApi,
  state: string,
): Promise<OAuthStateResult & { codeVerifier: string | null }> {
  const result = await dal.validateAndConsumeOAuthState(state, 'twitter')
  let codeVerifier: string | null = null
  if (result.metadata) {
    try {
      const parsed = JSON.parse(result.metadata) as { codeVerifier?: string }
      codeVerifier = parsed.codeVerifier ?? null
    } catch {
      // Ignore malformed metadata
    }
  }
  return { ...result, codeVerifier }
}
