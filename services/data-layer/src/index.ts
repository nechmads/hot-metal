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
import * as writingStyles from './domains/writing-styles'

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
	OAuthStateResult,
	CreateSocialConnectionInput,
	TokenUpdate,
	CreatePublicationOutletInput,
	CreateWritingStyleInput,
	UpdateWritingStyleInput,
} from './types'

// Re-export types for consumers
export { type Env } from './env'
export * from './types'

import type {
	User,
	Session,
	Publication,
	Topic,
	Idea,
	ActivityEntry,
	SocialConnection,
	PublicationOutlet,
	PublicationToken,
	PublicationTokenWithRawToken,
	ScoutSchedule,
	WritingStyle,
} from './types'

/**
 * Lightweight interface describing the DAL RPC surface.
 * Consumers should use `Service<DataLayerApi>` (or just `DataLayerApi`)
 * in their env types instead of importing the full DataLayer class,
 * which avoids TS2589 deep-instantiation errors.
 */
export interface DataLayerApi {
	// Users
	getUserById(id: string): Promise<User | null>
	getUserByEmail(email: string): Promise<User | null>
	createUser(data: CreateUserInput): Promise<User>
	updateUser(id: string, data: UpdateUserInput): Promise<User | null>
	listUsers(): Promise<User[]>

	// Sessions
	createSession(data: CreateSessionInput): Promise<Session>
	getSessionById(id: string): Promise<Session | null>
	listSessions(filters?: ListSessionsFilters): Promise<Session[]>
	updateSession(id: string, data: UpdateSessionInput): Promise<Session | null>
	countCompletedSessionsForWeek(pubId: string, weekStart: number): Promise<number>

	// Publications
	createPublication(data: CreatePublicationInput): Promise<Publication>
	getPublicationById(id: string): Promise<Publication | null>
	getPublicationBySlug(slug: string): Promise<Publication | null>
	listPublicationsByUser(userId: string): Promise<Publication[]>
	listAllPublications(): Promise<Publication[]>
	updatePublication(id: string, data: UpdatePublicationInput): Promise<Publication | null>
	deletePublication(id: string): Promise<void>
	getDuePublications(now: number): Promise<Array<{ id: string; scoutSchedule: ScoutSchedule; timezone: string }>>
	getPublicationsWithNullSchedule(): Promise<Array<{ id: string; scoutSchedule: ScoutSchedule; timezone: string }>>
	updatePublicationNextScoutAt(id: string, nextRun: number): Promise<void>
	getAllPublicationIds(): Promise<string[]>

	// Topics
	createTopic(data: CreateTopicInput): Promise<Topic>
	getTopicById(id: string): Promise<Topic | null>
	listTopicsByPublication(pubId: string): Promise<Topic[]>
	updateTopic(id: string, data: UpdateTopicInput): Promise<Topic | null>
	deleteTopic(id: string): Promise<void>

	// Ideas
	createIdea(data: CreateIdeaInput): Promise<Idea>
	createIdeas(items: CreateIdeaInput[]): Promise<number>
	getIdeaById(id: string): Promise<Idea | null>
	listIdeasByPublication(pubId: string, filters?: ListIdeasFilters): Promise<Idea[]>
	updateIdeaStatus(id: string, status: IdeaStatus): Promise<Idea | null>
	promoteIdea(id: string, sessionId: string): Promise<Idea | null>
	countIdeasByPublication(pubId: string): Promise<number>
	countIdeasByStatus(status: IdeaStatus): Promise<number>
	getRecentIdeasByPublication(pubId: string, sinceDays?: number): Promise<Idea[]>
	listRecentIdeasForUser(publicationIds: string[], limit?: number): Promise<Idea[]>

	// Activity
	getRecentActivity(cutoffDays?: number, userId?: string): Promise<ActivityEntry[]>

	// Audit Logs
	writeAuditLog(entry: AuditLogInput): Promise<void>

	// OAuth State
	storeOAuthState(state: string, provider: string, ttlSeconds?: number, userId?: string): Promise<void>
	validateAndConsumeOAuthState(state: string, provider: string): Promise<OAuthStateResult>

	// Social Connections
	createSocialConnection(data: CreateSocialConnectionInput): Promise<SocialConnection>
	getSocialConnectionsByUser(userId: string): Promise<SocialConnection[]>
	getSocialConnectionById(id: string): Promise<SocialConnection | null>
	getSocialConnectionWithDecryptedTokens(id: string): Promise<SocialConnection | null>
	updateSocialConnectionTokens(id: string, tokens: TokenUpdate): Promise<void>
	deleteSocialConnection(id: string): Promise<void>
	hasValidSocialConnection(userId: string, provider: string): Promise<boolean>

	// Publication Outlets
	createPublicationOutlet(data: CreatePublicationOutletInput): Promise<PublicationOutlet>
	listOutletsByPublication(pubId: string): Promise<PublicationOutlet[]>
	deletePublicationOutlet(id: string): Promise<void>

	// Publication Tokens
	createPublicationToken(pubId: string, label?: string): Promise<PublicationTokenWithRawToken>
	validatePublicationToken(rawToken: string): Promise<string | null>
	revokePublicationToken(id: string): Promise<void>
	listPublicationTokens(pubId: string): Promise<PublicationToken[]>

	// Writing Styles
	createWritingStyle(data: CreateWritingStyleInput): Promise<WritingStyle>
	getWritingStyleById(id: string): Promise<WritingStyle | null>
	listWritingStylesByUser(userId: string): Promise<WritingStyle[]>
	listPrebuiltStyles(): Promise<WritingStyle[]>
	updateWritingStyle(id: string, data: UpdateWritingStyleInput): Promise<WritingStyle | null>
	deleteWritingStyle(id: string): Promise<void>
}

/**
 * Data Access Layer — owns the consolidated D1 database and exposes
 * typed RPC methods via Cloudflare Service Bindings.
 *
 * Other services (writer-agent, content-scout, publisher) call these
 * methods instead of accessing D1 directly.
 */
// Compile-time check: DataLayer must satisfy DataLayerApi
void ({} as DataLayer satisfies DataLayerApi)

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
	getPublicationBySlug(slug: string) { return publications.getPublicationBySlug(this.env.DB, slug) }
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
	listRecentIdeasForUser(publicationIds: string[], limit?: number) { return ideas.listRecentIdeasForUser(this.env.DB, publicationIds, limit) }

	// ─── Activity ──────────────────────────────────────────────────────
	getRecentActivity(cutoffDays?: number, userId?: string) { return activity.getRecentActivity(this.env.DB, cutoffDays, userId) }

	// ─── Audit Logs ────────────────────────────────────────────────────
	writeAuditLog(entry: AuditLogInput) { return auditLogs.writeAuditLog(this.env.DB, entry) }

	// ─── OAuth State ───────────────────────────────────────────────────
	storeOAuthState(state: string, provider: string, ttlSeconds?: number, userId?: string) { return oauthState.storeOAuthState(this.env.DB, state, provider, ttlSeconds, userId) }
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

	// ─── Writing Styles ────────────────────────────────────────────────
	createWritingStyle(data: CreateWritingStyleInput) { return writingStyles.createWritingStyle(this.env.DB, data) }
	getWritingStyleById(id: string) { return writingStyles.getWritingStyleById(this.env.DB, id) }
	listWritingStylesByUser(userId: string) { return writingStyles.listWritingStylesByUser(this.env.DB, userId) }
	listPrebuiltStyles() { return writingStyles.listPrebuiltStyles(this.env.DB) }
	updateWritingStyle(id: string, data: UpdateWritingStyleInput) { return writingStyles.updateWritingStyle(this.env.DB, id, data) }
	deleteWritingStyle(id: string) { return writingStyles.deleteWritingStyle(this.env.DB, id) }
}

// Default HTTP handler — health check only
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		return new Response(JSON.stringify({ status: 'ok', service: 'data-layer' }), {
			headers: { 'Content-Type': 'application/json' },
		})
	},
}
