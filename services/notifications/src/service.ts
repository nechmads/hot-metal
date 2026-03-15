import { WorkerEntrypoint } from 'cloudflare:workers'
import type { NotificationsEnv } from './env'
import { sendNewIdeasEmail, sendDraftReadyEmail, sendPostPublishedEmail, sendNewCommentEmail, sendWelcomeEmail, sendAnalysisReportEmail } from './emails'

export interface SendNewIdeasParams {
	userId: string
	publicationName: string
	ideasCount: number
}

export interface SendDraftReadyParams {
	userId: string
	publicationName: string
	postTitle: string
}

export interface SendNewCommentParams {
	userId: string
	publicationName: string
	postSlug: string
	commenterName: string
	commentPreview: string
	postUrl: string
}

export interface SendPostPublishedParams {
	userId: string
	publicationName: string
	postTitle: string
	postUrl: string
}

export interface SendWelcomeParams {
	userId: string
	userEmail: string
	userName: string
}

export interface SendAnalysisReportParams {
	email: string
	url: string
	reportUrl: string
	overallScore: number
}

/**
 * RPC entrypoint for service-to-service notification calls.
 * Other services bind to this class via `entrypoint: "NotificationsService"`.
 *
 * Each method:
 * 1. Checks user notification preferences
 * 2. Looks up user email
 * 3. Sends the email (if enabled)
 * 4. Never throws — errors are logged and swallowed
 */
export class NotificationsService extends WorkerEntrypoint<NotificationsEnv> {
	async sendNewIdeasNotification(params: SendNewIdeasParams): Promise<void> {
		try {
			const prefs = await this.env.DAL.getOrCreateNotificationPreferences(params.userId)
			if (!prefs.newIdeas) {
				console.log(`[notifications] User ${params.userId} has new-ideas notifications disabled`)
				return
			}

			const user = await this.env.DAL.getUserById(params.userId)
			if (!user) {
				console.warn(`[notifications] User ${params.userId} not found, skipping notification`)
				return
			}

			await sendNewIdeasEmail(this.env, {
				userEmail: user.email,
				userName: user.name,
				publicationName: params.publicationName,
				ideasCount: params.ideasCount,
				webAppUrl: this.env.WEB_APP_URL,
			})
		} catch (err) {
			console.error('[notifications] sendNewIdeasNotification failed:', err)
		}
	}

	async sendDraftReadyNotification(params: SendDraftReadyParams): Promise<void> {
		try {
			const prefs = await this.env.DAL.getOrCreateNotificationPreferences(params.userId)
			if (!prefs.draftReady) {
				console.log(`[notifications] User ${params.userId} has draft-ready notifications disabled`)
				return
			}

			const user = await this.env.DAL.getUserById(params.userId)
			if (!user) {
				console.warn(`[notifications] User ${params.userId} not found, skipping notification`)
				return
			}

			await sendDraftReadyEmail(this.env, {
				userEmail: user.email,
				userName: user.name,
				publicationName: params.publicationName,
				postTitle: params.postTitle,
				webAppUrl: this.env.WEB_APP_URL,
			})
		} catch (err) {
			console.error('[notifications] sendDraftReadyNotification failed:', err)
		}
	}

	async sendNewCommentNotification(params: SendNewCommentParams): Promise<void> {
		try {
			const prefs = await this.env.DAL.getOrCreateNotificationPreferences(params.userId)
			if (!prefs.newComment) {
				console.log(`[notifications] User ${params.userId} has new-comment notifications disabled`)
				return
			}

			const user = await this.env.DAL.getUserById(params.userId)
			if (!user) {
				console.warn(`[notifications] User ${params.userId} not found, skipping notification`)
				return
			}

			await sendNewCommentEmail(this.env, {
				userEmail: user.email,
				userName: user.name,
				publicationName: params.publicationName,
				postSlug: params.postSlug,
				commenterName: params.commenterName,
				commentPreview: params.commentPreview,
				postUrl: params.postUrl,
			})
		} catch (err) {
			console.error('[notifications] sendNewCommentNotification failed:', err)
		}
	}

	// Welcome email is transactional — no preference check needed (new user, no prefs yet)
	// and no user lookup needed (caller provides email/name directly from JWT).
	async sendWelcomeNotification(params: SendWelcomeParams): Promise<void> {
		try {
			await sendWelcomeEmail(this.env, {
				userEmail: params.userEmail,
				userName: params.userName,
			})
		} catch (err) {
			console.error('[notifications] sendWelcomeNotification failed:', err)
		}
	}

	// Analysis report email is for anonymous public users — no user lookup or preference check.
	// Similar to welcome email pattern: caller provides the email directly.
	async sendAnalysisReportNotification(params: SendAnalysisReportParams): Promise<void> {
		try {
			await sendAnalysisReportEmail(this.env, {
				email: params.email,
				url: params.url,
				reportUrl: params.reportUrl,
				overallScore: params.overallScore,
			})
		} catch (err) {
			console.error('[notifications] sendAnalysisReportNotification failed:', err)
		}
	}

	async sendPostPublishedNotification(params: SendPostPublishedParams): Promise<void> {
		try {
			const prefs = await this.env.DAL.getOrCreateNotificationPreferences(params.userId)
			if (!prefs.postPublished) {
				console.log(`[notifications] User ${params.userId} has post-published notifications disabled`)
				return
			}

			const user = await this.env.DAL.getUserById(params.userId)
			if (!user) {
				console.warn(`[notifications] User ${params.userId} not found, skipping notification`)
				return
			}

			await sendPostPublishedEmail(this.env, {
				userEmail: user.email,
				userName: user.name,
				publicationName: params.publicationName,
				postTitle: params.postTitle,
				postUrl: params.postUrl,
			})
		} catch (err) {
			console.error('[notifications] sendPostPublishedNotification failed:', err)
		}
	}
}
