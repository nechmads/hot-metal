import { WorkerEntrypoint } from 'cloudflare:workers'
import type { NotificationsEnv } from './env'
import { logger } from '@hotmetal/shared'
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
		const log = logger('notifications')

		try {
			const prefs = await this.env.DAL.getOrCreateNotificationPreferences(params.userId)
			if (!prefs.newIdeas) {
				log.info('User has new-ideas notifications disabled', { component: 'rpc', userId: params.userId })
				return
			}

			const user = await this.env.DAL.getUserById(params.userId)
			if (!user) {
				log.warn('User not found, skipping notification', { component: 'rpc', userId: params.userId })
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
			log.error('sendNewIdeasNotification failed', {
				component: 'rpc',
				userId: params.userId,
				error: err instanceof Error ? err.message : String(err),
			})
		}
	}

	async sendDraftReadyNotification(params: SendDraftReadyParams): Promise<void> {
		const log = logger('notifications')

		try {
			const prefs = await this.env.DAL.getOrCreateNotificationPreferences(params.userId)
			if (!prefs.draftReady) {
				log.info('User has draft-ready notifications disabled', { component: 'rpc', userId: params.userId })
				return
			}

			const user = await this.env.DAL.getUserById(params.userId)
			if (!user) {
				log.warn('User not found, skipping notification', { component: 'rpc', userId: params.userId })
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
			log.error('sendDraftReadyNotification failed', {
				component: 'rpc',
				userId: params.userId,
				postTitle: params.postTitle,
				error: err instanceof Error ? err.message : String(err),
			})
		}
	}

	async sendNewCommentNotification(params: SendNewCommentParams): Promise<void> {
		const log = logger('notifications')

		try {
			const prefs = await this.env.DAL.getOrCreateNotificationPreferences(params.userId)
			if (!prefs.newComment) {
				log.info('User has new-comment notifications disabled', { component: 'rpc', userId: params.userId })
				return
			}

			const user = await this.env.DAL.getUserById(params.userId)
			if (!user) {
				log.warn('User not found, skipping notification', { component: 'rpc', userId: params.userId })
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
			log.error('sendNewCommentNotification failed', {
				component: 'rpc',
				userId: params.userId,
				postSlug: params.postSlug,
				error: err instanceof Error ? err.message : String(err),
			})
		}
	}

	// Welcome email is transactional — no preference check needed (new user, no prefs yet)
	// and no user lookup needed (caller provides email/name directly from JWT).
	async sendWelcomeNotification(params: SendWelcomeParams): Promise<void> {
		const log = logger('notifications')

		try {
			await sendWelcomeEmail(this.env, {
				userEmail: params.userEmail,
				userName: params.userName,
			})
		} catch (err) {
			log.error('sendWelcomeNotification failed', {
				component: 'rpc',
				userId: params.userId,
				error: err instanceof Error ? err.message : String(err),
			})
		}
	}

	// Analysis report email is for anonymous public users — no user lookup or preference check.
	// Similar to welcome email pattern: caller provides the email directly.
	async sendAnalysisReportNotification(params: SendAnalysisReportParams): Promise<void> {
		const log = logger('notifications')

		try {
			await sendAnalysisReportEmail(this.env, {
				email: params.email,
				url: params.url,
				reportUrl: params.reportUrl,
				overallScore: params.overallScore,
			})
		} catch (err) {
			log.error('sendAnalysisReportNotification failed', {
				component: 'rpc',
				url: params.url,
				error: err instanceof Error ? err.message : String(err),
			})
		}
	}

	async sendPostPublishedNotification(params: SendPostPublishedParams): Promise<void> {
		const log = logger('notifications')

		try {
			const prefs = await this.env.DAL.getOrCreateNotificationPreferences(params.userId)
			if (!prefs.postPublished) {
				log.info('User has post-published notifications disabled', { component: 'rpc', userId: params.userId })
				return
			}

			const user = await this.env.DAL.getUserById(params.userId)
			if (!user) {
				log.warn('User not found, skipping notification', { component: 'rpc', userId: params.userId })
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
			log.error('sendPostPublishedNotification failed', {
				component: 'rpc',
				userId: params.userId,
				postTitle: params.postTitle,
				error: err instanceof Error ? err.message : String(err),
			})
		}
	}
}
