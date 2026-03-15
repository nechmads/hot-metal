import { Resend } from 'resend'
import type { NotificationsEnv } from './env'

function getResend(env: NotificationsEnv): Resend | null {
	if (!env.RESEND_API_KEY) {
		console.warn('[notifications] RESEND_API_KEY not configured, skipping email')
		return null
	}
	return new Resend(env.RESEND_API_KEY)
}

export interface NewIdeasEmailParams {
	userEmail: string
	userName: string
	publicationName: string
	ideasCount: number
	webAppUrl: string
}

export async function sendNewIdeasEmail(
	env: NotificationsEnv,
	params: NewIdeasEmailParams,
): Promise<void> {
	const resend = getResend(env)
	if (!resend) return

	const { userEmail, userName, publicationName, ideasCount, webAppUrl } = params

	try {
		await resend.emails.send({
			from: env.FROM_EMAIL,
			to: userEmail,
			subject: `${ideasCount} new idea${ideasCount === 1 ? '' : 's'} for ${publicationName}`,
			text: [
				`Hi ${userName},`,
				'',
				`Hot Metal's content scout found ${ideasCount} new idea${ideasCount === 1 ? '' : 's'} for ${publicationName}.`,
				'',
				`Review them in the app: ${webAppUrl}`,
				'',
				'— Hot Metal',
				'',
				`Manage your notification preferences: ${webAppUrl}/settings`,
			].join('\n'),
		})
		console.log(`[notifications] Sent new-ideas email (${ideasCount} ideas for ${publicationName})`)
	} catch (err) {
		console.error('[notifications] Failed to send new-ideas email:', err)
	}
}

export interface DraftReadyEmailParams {
	userEmail: string
	userName: string
	publicationName: string
	postTitle: string
	webAppUrl: string
}

export async function sendDraftReadyEmail(
	env: NotificationsEnv,
	params: DraftReadyEmailParams,
): Promise<void> {
	const resend = getResend(env)
	if (!resend) return

	const { userEmail, userName, publicationName, postTitle, webAppUrl } = params

	try {
		await resend.emails.send({
			from: env.FROM_EMAIL,
			to: userEmail,
			subject: `New draft ready: ${postTitle}`,
			text: [
				`Hi ${userName},`,
				'',
				`A new draft has been written for ${publicationName}:`,
				'',
				`  "${postTitle}"`,
				'',
				`Review and edit it in the app: ${webAppUrl}`,
				'',
				'— Hot Metal',
				'',
				`Manage your notification preferences: ${webAppUrl}/settings`,
			].join('\n'),
		})
		console.log(`[notifications] Sent draft-ready email for "${postTitle}"`)
	} catch (err) {
		console.error('[notifications] Failed to send draft-ready email:', err)
	}
}

export interface PostPublishedEmailParams {
	userEmail: string
	userName: string
	publicationName: string
	postTitle: string
	postUrl: string
}

export interface NewCommentEmailParams {
	userEmail: string
	userName: string
	publicationName: string
	postSlug: string
	commenterName: string
	commentPreview: string
	postUrl: string
}

export async function sendNewCommentEmail(
	env: NotificationsEnv,
	params: NewCommentEmailParams,
): Promise<void> {
	const resend = getResend(env)
	if (!resend) return

	const { userEmail, userName, publicationName, postSlug, commenterName, commentPreview, postUrl } = params

	try {
		await resend.emails.send({
			from: env.FROM_EMAIL,
			to: userEmail,
			subject: `New comment on "${postSlug}" — ${publicationName}`,
			text: [
				`Hi ${userName},`,
				'',
				`${commenterName} left a comment on your post "${postSlug}" in ${publicationName}:`,
				'',
				`  "${commentPreview}"`,
				'',
				`View the post: ${postUrl}`,
				'',
				'— Hot Metal',
				'',
				`Manage your notification preferences: ${env.WEB_APP_URL}/settings`,
			].join('\n'),
		})
		console.log(`[notifications] Sent new-comment email for "${postSlug}"`)
	} catch (err) {
		console.error('[notifications] Failed to send new-comment email:', err)
	}
}

export interface WelcomeEmailParams {
	userEmail: string
	userName: string
}

export async function sendWelcomeEmail(
	env: NotificationsEnv,
	params: WelcomeEmailParams,
): Promise<void> {
	const resend = getResend(env)
	if (!resend) return

	const { userEmail, userName } = params
	const firstName = userName.split(' ')[0] || userName

	try {
		await resend.emails.send({
			from: env.WELCOME_FROM_EMAIL || env.FROM_EMAIL,
			to: userEmail,
			subject: 'Welcome to Hot Metal!',
			text: [
				`Hi ${firstName},`,
				'',
				"I'm Shahar Nechmad, the creator of Hot Metal. Welcome aboard!",
				'',
				"Hot Metal is a work of passion — a tool I originally built for myself to make content creation easier and more consistent. I decided to make it public because I believe it can help others too.",
				'',
				"You can learn more about me and the story behind Hot Metal here: https://hotmetalapp.com/about",
				'',
				"I'd love to hear from you — whether it's a question, feedback, a bug you spotted, or just to say hi. You can reply directly to this email anytime.",
				'',
				"Also, you can follow new features and product updates on the Hot Metal blog: https://hot-metal-story.hotmetalapp.com/",
				'',
				'Thanks for giving Hot Metal a try. I hope it helps you build something great.',
				'',
				'Shahar',
			].join('\n'),
		})
		console.log(`[notifications] Sent welcome email to user`)
	} catch (err) {
		console.error('[notifications] Failed to send welcome email:', err)
	}
}

export interface AnalysisReportEmailParams {
	email: string
	url: string
	reportUrl: string
	overallScore: number
}

export async function sendAnalysisReportEmail(
	env: NotificationsEnv,
	params: AnalysisReportEmailParams,
): Promise<void> {
	const resend = getResend(env)
	if (!resend) return

	const { email, url, reportUrl, overallScore } = params

	const scoreLabel = overallScore >= 80 ? 'Excellent' :
		overallScore >= 60 ? 'Good' :
		overallScore >= 40 ? 'Needs work' : 'Needs attention'

	try {
		await resend.emails.send({
			from: env.FROM_EMAIL,
			to: email,
			subject: `Your AEO/GEO Analysis Report is Ready — ${overallScore}/100`,
			text: [
				'Hi,',
				'',
				`Your content analysis for ${url} is complete.`,
				'',
				`Overall Score: ${overallScore}/100 (${scoreLabel})`,
				'',
				'View your full report:',
				reportUrl,
				'',
				'Your report includes:',
				'  - Scores across 17 AEO/GEO dimensions',
				'  - Platform-specific fit (Google AI Overviews, ChatGPT Search, Perplexity, Bing Copilot)',
				'  - Quick wins and rewrite priorities',
				'  - Critical issues that need attention',
				'',
				'Want to optimize your content automatically?',
				`Try Hot Metal for free: ${env.WEB_APP_URL}/sign-up`,
				'',
				'— Hot Metal',
			].join('\n'),
		})
		console.log(`[notifications] Sent analysis report email (score: ${overallScore})`)
	} catch (err) {
		console.error('[notifications] Failed to send analysis report email:', err)
	}
}

export async function sendPostPublishedEmail(
	env: NotificationsEnv,
	params: PostPublishedEmailParams,
): Promise<void> {
	const resend = getResend(env)
	if (!resend) return

	const { userEmail, userName, publicationName, postTitle, postUrl } = params

	try {
		await resend.emails.send({
			from: env.FROM_EMAIL,
			to: userEmail,
			subject: `Published: ${postTitle}`,
			text: [
				`Hi ${userName},`,
				'',
				`A new post was just auto-published to ${publicationName}:`,
				'',
				`  "${postTitle}"`,
				'',
				`Read it live: ${postUrl}`,
				'',
				'— Hot Metal',
				'',
				`Manage your notification preferences: ${env.WEB_APP_URL}/settings`,
			].join('\n'),
		})
		console.log(`[notifications] Sent post-published email for "${postTitle}"`)
	} catch (err) {
		console.error('[notifications] Failed to send post-published email:', err)
	}
}
