/**
 * Input/output types for the DAL RPC interface.
 * Output types use camelCase. Input types describe method parameters.
 * These are exported from the package for type-safe consumers.
 */

import type {
	AutoPublishMode,
	IdeaSource,
	IdeaStatus,
	ScoutSchedule,
	TopicPriority,
} from '@hotmetal/content-core'

// Re-export content-core types that consumers need
export type { AutoPublishMode, IdeaSource, IdeaStatus, ScoutSchedule, TopicPriority }

// ─── Users ───────────────────────────────────────────────────────────

export interface User {
	id: string
	email: string
	name: string
	createdAt: number
	updatedAt: number
}

export interface CreateUserInput {
	id: string
	email: string
	name: string
}

export interface UpdateUserInput {
	email?: string
	name?: string
}

// ─── Sessions ────────────────────────────────────────────────────────

export type SessionStatus = 'active' | 'completed' | 'archived'

export interface Session {
	id: string
	userId: string
	title: string | null
	status: SessionStatus
	currentDraftVersion: number
	cmsPostId: string | null
	publicationId: string | null
	ideaId: string | null
	seedContext: string | null
	featuredImageUrl: string | null
	styleId: string | null
	createdAt: number
	updatedAt: number
}

export interface CreateSessionInput {
	id: string
	userId: string
	title?: string
	publicationId?: string
	ideaId?: string
	seedContext?: string
	styleId?: string
}

export interface UpdateSessionInput {
	title?: string | null
	status?: SessionStatus
	currentDraftVersion?: number
	cmsPostId?: string | null
	publicationId?: string | null
	ideaId?: string | null
	seedContext?: string | null
	featuredImageUrl?: string | null
	styleId?: string | null
}

export interface ListSessionsFilters {
	userId?: string
	status?: SessionStatus
	publicationId?: string
}

// ─── Publications ────────────────────────────────────────────────────

export interface Publication {
	id: string
	userId: string
	cmsPublicationId: string | null
	name: string
	slug: string
	description: string | null
	writingTone: string | null
	defaultAuthor: string
	autoPublishMode: AutoPublishMode
	cadencePostsPerWeek: number
	scoutSchedule: ScoutSchedule
	timezone: string
	nextScoutAt: number | null
	styleId: string | null
	feedFullEnabled: boolean
	feedPartialEnabled: boolean
	createdAt: number
	updatedAt: number
}

export interface CreatePublicationInput {
	id: string
	userId: string
	name: string
	slug: string
	description?: string
	writingTone?: string
	defaultAuthor?: string
	autoPublishMode?: AutoPublishMode
	cadencePostsPerWeek?: number
	scoutSchedule?: ScoutSchedule
	timezone?: string
	styleId?: string
	feedFullEnabled?: boolean
	feedPartialEnabled?: boolean
}

export interface UpdatePublicationInput {
	name?: string
	slug?: string
	description?: string | null
	writingTone?: string | null
	defaultAuthor?: string
	autoPublishMode?: AutoPublishMode
	cadencePostsPerWeek?: number
	cmsPublicationId?: string | null
	scoutSchedule?: ScoutSchedule
	timezone?: string
	nextScoutAt?: number | null
	styleId?: string | null
	feedFullEnabled?: boolean
	feedPartialEnabled?: boolean
}

// ─── Topics ──────────────────────────────────────────────────────────

export interface Topic {
	id: string
	publicationId: string
	name: string
	description: string | null
	priority: TopicPriority
	isActive: boolean
	createdAt: number
	updatedAt: number
}

export interface CreateTopicInput {
	id: string
	publicationId: string
	name: string
	description?: string
	priority?: TopicPriority
}

export interface UpdateTopicInput {
	name?: string
	description?: string | null
	priority?: TopicPriority
	isActive?: boolean
}

// ─── Ideas ───────────────────────────────────────────────────────────

export interface Idea {
	id: string
	publicationId: string
	topicId: string | null
	title: string
	angle: string
	summary: string
	sources: IdeaSource[] | null
	status: IdeaStatus
	sessionId: string | null
	relevanceScore: number | null
	createdAt: number
	updatedAt: number
}

export interface CreateIdeaInput {
	id: string
	publicationId: string
	topicId?: string | null
	title: string
	angle: string
	summary: string
	sources?: string
	relevanceScore?: number | null
}

export interface ListIdeasFilters {
	status?: IdeaStatus
}

// ─── Activity ────────────────────────────────────────────────────────

export interface ActivityEntry {
	id: string
	title: string | null
	status: string
	publicationId: string | null
	publicationName: string | null
	cmsPostId: string | null
	createdAt: number
	updatedAt: number
}

// ─── Audit Logs ──────────────────────────────────────────────────────

export interface AuditLogInput {
	postId: string
	outlet: string
	action: string
	status: 'success' | 'failed'
	resultData?: string
	errorMessage?: string
}

// ─── OAuth State ─────────────────────────────────────────────────────

export interface OAuthStateResult {
	valid: boolean
	userId: string | null
	metadata: string | null
}

// ─── Social Connections ──────────────────────────────────────────────

export interface SocialConnection {
	id: string
	userId: string
	provider: string
	displayName: string | null
	connectionType: string | null
	externalId: string | null
	accessToken: string | null
	refreshToken: string | null
	tokenExpiresAt: number | null
	scopes: string | null
	createdAt: number
	updatedAt: number
}

export interface CreateSocialConnectionInput {
	userId: string
	provider: string
	displayName?: string
	connectionType?: string
	externalId?: string
	accessToken?: string
	refreshToken?: string
	tokenExpiresAt?: number
	scopes?: string
}

export interface TokenUpdate {
	accessToken?: string | null
	refreshToken?: string | null
	tokenExpiresAt?: number | null
}

// ─── Publication Outlets ─────────────────────────────────────────────

export interface PublicationOutlet {
	id: string
	publicationId: string
	connectionId: string
	autoPublish: boolean
	settings: string | null
	createdAt: number
	updatedAt: number
}

export interface CreatePublicationOutletInput {
	publicationId: string
	connectionId: string
	autoPublish?: boolean
	settings?: string
}

// ─── Writing Styles ─────────────────────────────────────────────────

export interface WritingStyle {
	id: string
	userId: string | null
	name: string
	description: string | null
	systemPrompt: string
	toneGuide: string | null
	sourceUrl: string | null
	sampleText: string | null
	isPrebuilt: boolean
	createdAt: number
	updatedAt: number
}

export interface CreateWritingStyleInput {
	id: string
	userId: string
	name: string
	description?: string
	systemPrompt: string
	toneGuide?: string
	sourceUrl?: string
	sampleText?: string
}

export interface UpdateWritingStyleInput {
	name?: string
	description?: string | null
	systemPrompt?: string
	toneGuide?: string | null
	sourceUrl?: string | null
	sampleText?: string | null
}

// ─── Publication Tokens ──────────────────────────────────────────────

export interface PublicationToken {
	id: string
	publicationId: string
	tokenHash: string
	label: string | null
	isActive: boolean
	createdAt: number
	revokedAt: number | null
}

export interface PublicationTokenWithRawToken {
	token: PublicationToken
	rawToken: string
}
