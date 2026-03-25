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
	firstName: string | null
	lastName: string | null
	tier: string
	createdAt: number
	updatedAt: number
}

export interface CreateUserInput {
	id: string
	email: string
	name: string
	firstName?: string
	lastName?: string
}

export interface UpdateUserInput {
	email?: string
	name?: string
	firstName?: string | null
	lastName?: string | null
	tier?: string
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
	cmsPostId?: string
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

export interface SocialLinks {
	twitter?: string
	linkedin?: string
	github?: string
	website?: string
}

export interface Publication {
	id: string
	userId: string
	cmsPublicationId: string | null
	projectId: string | null
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
	templateId: string
	tagline: string | null
	logoUrl: string | null
	headerImageUrl: string | null
	accentColor: string | null
	socialLinks: SocialLinks | null
	commentsEnabled: boolean
	commentsModeration: CommentModeration
	customDomain: string | null
	metaDescription: string | null
	createdAt: number
	updatedAt: number
}

export interface CreatePublicationInput {
	id: string
	userId: string
	name: string
	slug: string
	projectId?: string
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
	templateId?: string
	tagline?: string
	logoUrl?: string
	headerImageUrl?: string
	accentColor?: string
	socialLinks?: SocialLinks
	commentsEnabled?: boolean
	commentsModeration?: CommentModeration
	metaDescription?: string
}

export interface UpdatePublicationInput {
	name?: string
	slug?: string
	projectId?: string | null
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
	templateId?: string
	tagline?: string | null
	logoUrl?: string | null
	headerImageUrl?: string | null
	accentColor?: string | null
	socialLinks?: SocialLinks | null
	commentsEnabled?: boolean
	commentsModeration?: CommentModeration
	customDomain?: string | null
	metaDescription?: string | null
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
	finalPrompt: string | null
	toneGuide: string | null
	sourceUrl: string | null
	sampleText: string | null
	// Voice
	voicePerson: string | null
	voiceFormality: string | null
	voicePersonalityTraits: string[] | null
	// Sentence patterns
	sentenceNotablePatterns: string[] | null
	// Structure
	structureOpeningStyle: string | null
	structureClosingStyle: string | null
	structureParagraphLength: string | null
	structureUseOfHeadings: string | null
	structureTransitionStyle: string | null
	// Vocabulary
	vocabularyLevel: string | null
	vocabularyFavoritePhrases: string[] | null
	vocabularyPowerWords: string[] | null
	vocabularyJargonUsage: string | null
	// Content & rhetorical
	rhetoricalDevices: string[] | null
	contentUseOfExamples: string | null
	contentUseOfData: string | null
	contentStorytellingApproach: string | null
	contentHumorStyle: string | null
	// Rules
	dos: string[] | null
	donts: string[] | null
	isPrebuilt: boolean
	createdAt: number
	updatedAt: number
}

export interface CreateWritingStyleInput {
	id: string
	userId?: string
	name: string
	isPrebuilt?: boolean
	description?: string
	systemPrompt: string
	finalPrompt?: string
	toneGuide?: string
	sourceUrl?: string
	sampleText?: string
	voicePerson?: string
	voiceFormality?: string
	voicePersonalityTraits?: string[]
	sentenceNotablePatterns?: string[]
	structureOpeningStyle?: string
	structureClosingStyle?: string
	structureParagraphLength?: string
	structureUseOfHeadings?: string
	structureTransitionStyle?: string
	vocabularyLevel?: string
	vocabularyFavoritePhrases?: string[]
	vocabularyPowerWords?: string[]
	vocabularyJargonUsage?: string
	rhetoricalDevices?: string[]
	contentUseOfExamples?: string
	contentUseOfData?: string
	contentStorytellingApproach?: string
	contentHumorStyle?: string
	dos?: string[]
	donts?: string[]
}

export interface UpdateWritingStyleInput {
	name?: string
	description?: string | null
	systemPrompt?: string
	finalPrompt?: string | null
	toneGuide?: string | null
	sourceUrl?: string | null
	sampleText?: string | null
	voicePerson?: string | null
	voiceFormality?: string | null
	voicePersonalityTraits?: string[] | null
	sentenceNotablePatterns?: string[] | null
	structureOpeningStyle?: string | null
	structureClosingStyle?: string | null
	structureParagraphLength?: string | null
	structureUseOfHeadings?: string | null
	structureTransitionStyle?: string | null
	vocabularyLevel?: string | null
	vocabularyFavoritePhrases?: string[] | null
	vocabularyPowerWords?: string[] | null
	vocabularyJargonUsage?: string | null
	rhetoricalDevices?: string[] | null
	contentUseOfExamples?: string | null
	contentUseOfData?: string | null
	contentStorytellingApproach?: string | null
	contentHumorStyle?: string | null
	dos?: string[] | null
	donts?: string[] | null
}

// ─── Notification Preferences ───────────────────────────────────────

export interface NotificationPreferences {
	userId: string
	newIdeas: boolean
	draftReady: boolean
	postPublished: boolean
	newComment: boolean
	createdAt: number
	updatedAt: number
}

export interface UpdateNotificationPreferencesInput {
	newIdeas?: boolean
	draftReady?: boolean
	postPublished?: boolean
	newComment?: boolean
}

// ─── Comments ───────────────────────────────────────────────────────

export type CommentStatus = 'pending' | 'approved' | 'deleted'
export type CommentModeration = 'auto-approve' | 'pre-approve'

export interface Comment {
	id: string
	publicationId: string
	postSlug: string
	parentId: string | null
	authorName: string
	authorEmail: string | null
	content: string
	status: CommentStatus
	createdAt: number
	updatedAt: number
}

export interface CreateCommentInput {
	id: string
	publicationId: string
	postSlug: string
	parentId?: string | null
	authorName: string
	authorEmail?: string | null
	content: string
	status?: CommentStatus
}

export interface ListCommentsFilters {
	status?: CommentStatus
}

// ─── Subscriptions ──────────────────────────────────────────────────

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled'

export interface Subscription {
	id: string
	userId: string
	paddleCustomerId: string
	paddleSubscriptionId: string
	paddlePriceId: string | null
	tier: string
	status: SubscriptionStatus
	currentPeriodStart: string | null
	currentPeriodEnd: string | null
	canceledAt: string | null
	createdAt: number
	updatedAt: number
}

export interface CreateSubscriptionInput {
	id: string
	userId: string
	paddleCustomerId: string
	paddleSubscriptionId: string
	paddlePriceId?: string
	tier: string
	status: SubscriptionStatus
	currentPeriodStart?: string
	currentPeriodEnd?: string
}

export interface UpdateSubscriptionInput {
	paddleSubscriptionId?: string
	paddlePriceId?: string | null
	tier?: string
	status?: SubscriptionStatus
	currentPeriodStart?: string | null
	currentPeriodEnd?: string | null
	canceledAt?: string | null
}

// ─── Paddle Events ──────────────────────────────────────────────────

export interface PaddleEvent {
	eventId: string
	eventType: string
	processedAt: number
}

// ─── User API Keys ──────────────────────────────────────────────────

export interface UserApiKey {
	id: string
	userId: string
	tokenHash: string
	label: string | null
	lastFour: string
	isActive: boolean
	lastUsedAt: number | null
	createdAt: number
	revokedAt: number | null
}

export interface UserApiKeyWithRawToken {
	key: UserApiKey
	rawToken: string
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

// ─── Projects ───────────────────────────────────────────────────────

export type GoalType = 'personal_brand' | 'product_awareness'
export type ProjectStatus = 'active' | 'archived'

export interface Project {
	id: string
	userId: string
	name: string
	goalType: GoalType
	status: ProjectStatus
	createdAt: number
	updatedAt: number
}

export interface CreateProjectInput {
	id: string
	userId: string
	name: string
	goalType: GoalType
}

export interface UpdateProjectInput {
	name?: string
	goalType?: GoalType
	status?: ProjectStatus
}

// ─── Project Knowledge ──────────────────────────────────────────────

export interface KnowledgeItem {
	id: string
	projectId: string
	fieldKey: string
	fieldValue: string
	createdAt: number
	updatedAt: number
}

export interface UpsertKnowledgeInput {
	projectId: string
	items: Array<{ fieldKey: string; fieldValue: string }>
}

// ─── Strategies ─────────────────────────────────────────────────────

export interface ContentPillar {
	name: string
	description: string
	exampleTopics: string[]
}

export interface ChannelRecommendation {
	type: string
	cadence: string
	rationale: string
}

export interface SampleWeekEntry {
	dayOfWeek: string
	channel: string
	contentType: string
	topicIdea: string
}

export interface Strategy {
	id: string
	projectId: string
	version: number
	targetAudience: string | null
	contentPillars: ContentPillar[] | null
	recommendedChannels: ChannelRecommendation[] | null
	toneAndVoice: string | null
	sampleWeek: SampleWeekEntry[] | null
	fullMarkdown: string
	isActive: boolean
	generatedAt: number
	editedAt: number | null
}

export interface CreateStrategyInput {
	id: string
	projectId: string
	version?: number
	targetAudience?: string
	contentPillars?: ContentPillar[]
	recommendedChannels?: ChannelRecommendation[]
	toneAndVoice?: string
	sampleWeek?: SampleWeekEntry[]
	fullMarkdown: string
}

export interface UpdateStrategyInput {
	fullMarkdown?: string
	targetAudience?: string
	contentPillars?: ContentPillar[]
	recommendedChannels?: ChannelRecommendation[]
	toneAndVoice?: string
	sampleWeek?: SampleWeekEntry[]
}
