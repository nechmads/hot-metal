import { WorkerEntrypoint } from 'cloudflare:workers'
import type { Env } from './env'

import * as users from './domains/users'
import * as sessions from './domains/sessions'
import * as publications from './domains/publications'
import * as topics from './domains/topics'
import * as ideas from './domains/ideas'
import * as activity from './domains/activity'
import * as auditLogs from './domains/audit-logs'
import * as oauthState from './domains/oauth-state'
import * as socialConnections from './domains/social-connections'
import * as publicationOutlets from './domains/publication-outlets'
import * as publicationTokens from './domains/publication-tokens'

import type {
	CreateUserInput,
	UpdateUserInput,
	CreateSessionInput,
	UpdateSessionInput,
	ListSessionsFilters,
	CreatePublicationInput,
	UpdatePublicationInput,
	CreateTopicInput,
	UpdateTopicInput,
	CreateIdeaInput,
	ListIdeasFilters,
	IdeaStatus,
	AuditLogInput,
	CreateSocialConnectionInput,
	TokenUpdate,
	CreatePublicationOutletInput,
} from './types'

// Re-export types for consumers
export { type Env } from './env'
export * from './types'

/**
 * Data Access Layer — owns the consolidated D1 database and exposes
 * typed RPC methods via Cloudflare Service Bindings.
 *
 * Other services (writer-agent, content-scout, publisher) call these
 * methods instead of accessing D1 directly.
 */
export class DataLayer extends WorkerEntrypoint<Env> {
	// ─── Users ─────────────────────────────────────────────────────────
	getUserById(id: string) { return users.getUserById(this.env.DB, id) }
	getUserByEmail(email: string) { return users.getUserByEmail(this.env.DB, email) }
	createUser(data: CreateUserInput) { return users.createUser(this.env.DB, data) }
	updateUser(id: string, data: UpdateUserInput) { return users.updateUser(this.env.DB, id, data) }
	listUsers() { return users.listUsers(this.env.DB) }

	// ─── Sessions ──────────────────────────────────────────────────────
	createSession(data: CreateSessionInput) { return sessions.createSession(this.env.DB, data) }
	getSessionById(id: string) { return sessions.getSessionById(this.env.DB, id) }
	listSessions(filters?: ListSessionsFilters) { return sessions.listSessions(this.env.DB, filters) }
	updateSession(id: string, data: UpdateSessionInput) { return sessions.updateSession(this.env.DB, id, data) }
	countCompletedSessionsForWeek(pubId: string, weekStart: number) { return sessions.countCompletedForWeek(this.env.DB, pubId, weekStart) }

	// ─── Publications ──────────────────────────────────────────────────
	createPublication(data: CreatePublicationInput) { return publications.createPublication(this.env.DB, data) }
	getPublicationById(id: string) { return publications.getPublicationById(this.env.DB, id) }
	listPublicationsByUser(userId: string) { return publications.listPublicationsByUser(this.env.DB, userId) }
	listAllPublications() { return publications.listAllPublications(this.env.DB) }
	updatePublication(id: string, data: UpdatePublicationInput) { return publications.updatePublication(this.env.DB, id, data) }
	deletePublication(id: string) { return publications.deletePublication(this.env.DB, id) }
	getDuePublications(now: number) { return publications.getDuePublications(this.env.DB, now) }
	getPublicationsWithNullSchedule() { return publications.getPublicationsWithNullSchedule(this.env.DB) }
	updatePublicationNextScoutAt(id: string, nextRun: number) { return publications.updatePublicationNextScoutAt(this.env.DB, id, nextRun) }
	getAllPublicationIds() { return publications.getAllPublicationIds(this.env.DB) }

	// ─── Topics ────────────────────────────────────────────────────────
	createTopic(data: CreateTopicInput) { return topics.createTopic(this.env.DB, data) }
	getTopicById(id: string) { return topics.getTopicById(this.env.DB, id) }
	listTopicsByPublication(pubId: string) { return topics.listTopicsByPublication(this.env.DB, pubId) }
	updateTopic(id: string, data: UpdateTopicInput) { return topics.updateTopic(this.env.DB, id, data) }
	deleteTopic(id: string) { return topics.deleteTopic(this.env.DB, id) }

	// ─── Ideas ─────────────────────────────────────────────────────────
	createIdea(data: CreateIdeaInput) { return ideas.createIdea(this.env.DB, data) }
	createIdeas(items: CreateIdeaInput[]) { return ideas.createIdeas(this.env.DB, items) }
	getIdeaById(id: string) { return ideas.getIdeaById(this.env.DB, id) }
	listIdeasByPublication(pubId: string, filters?: ListIdeasFilters) { return ideas.listIdeasByPublication(this.env.DB, pubId, filters) }
	updateIdeaStatus(id: string, status: IdeaStatus) { return ideas.updateIdeaStatus(this.env.DB, id, status) }
	promoteIdea(id: string, sessionId: string) { return ideas.promoteIdea(this.env.DB, id, sessionId) }
	countIdeasByPublication(pubId: string) { return ideas.countIdeasByPublication(this.env.DB, pubId) }
	countIdeasByStatus(status: IdeaStatus) { return ideas.countIdeasByStatus(this.env.DB, status) }
	getRecentIdeasByPublication(pubId: string, sinceDays?: number) { return ideas.getRecentIdeasByPublication(this.env.DB, pubId, sinceDays) }

	// ─── Activity ──────────────────────────────────────────────────────
	getRecentActivity(cutoffDays?: number) { return activity.getRecentActivity(this.env.DB, cutoffDays) }

	// ─── Audit Logs ────────────────────────────────────────────────────
	writeAuditLog(entry: AuditLogInput) { return auditLogs.writeAuditLog(this.env.DB, entry) }

	// ─── OAuth State ───────────────────────────────────────────────────
	storeOAuthState(state: string, provider: string, ttlSeconds?: number) { return oauthState.storeOAuthState(this.env.DB, state, provider, ttlSeconds) }
	validateAndConsumeOAuthState(state: string, provider: string) { return oauthState.validateAndConsumeOAuthState(this.env.DB, state, provider) }

	// ─── Social Connections ────────────────────────────────────────────
	createSocialConnection(data: CreateSocialConnectionInput) {
		return socialConnections.createSocialConnection(this.env.DB, data, this.env.TOKEN_ENCRYPTION_KEY)
	}
	getSocialConnectionsByUser(userId: string) { return socialConnections.getSocialConnectionsByUser(this.env.DB, userId) }
	getSocialConnectionById(id: string) { return socialConnections.getSocialConnectionById(this.env.DB, id) }
	getSocialConnectionWithDecryptedTokens(id: string) {
		return socialConnections.getSocialConnectionWithDecryptedTokens(this.env.DB, id, this.env.TOKEN_ENCRYPTION_KEY)
	}
	updateSocialConnectionTokens(id: string, tokens: TokenUpdate) {
		return socialConnections.updateSocialConnectionTokens(this.env.DB, id, tokens, this.env.TOKEN_ENCRYPTION_KEY)
	}
	deleteSocialConnection(id: string) { return socialConnections.deleteSocialConnection(this.env.DB, id) }
	hasValidSocialConnection(userId: string, provider: string) { return socialConnections.hasValidSocialConnection(this.env.DB, userId, provider) }

	// ─── Publication Outlets ───────────────────────────────────────────
	createPublicationOutlet(data: CreatePublicationOutletInput) { return publicationOutlets.createPublicationOutlet(this.env.DB, data) }
	listOutletsByPublication(pubId: string) { return publicationOutlets.listOutletsByPublication(this.env.DB, pubId) }
	deletePublicationOutlet(id: string) { return publicationOutlets.deletePublicationOutlet(this.env.DB, id) }

	// ─── Publication Tokens ────────────────────────────────────────────
	createPublicationToken(pubId: string, label?: string) { return publicationTokens.createPublicationToken(this.env.DB, pubId, label) }
	validatePublicationToken(rawToken: string) { return publicationTokens.validatePublicationToken(this.env.DB, rawToken) }
	revokePublicationToken(id: string) { return publicationTokens.revokePublicationToken(this.env.DB, id) }
	listPublicationTokens(pubId: string) { return publicationTokens.listPublicationTokens(this.env.DB, pubId) }
}

// Default HTTP handler — health check only
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		return new Response(JSON.stringify({ status: 'ok', service: 'data-layer' }), {
			headers: { 'Content-Type': 'application/json' },
		})
	},
}
