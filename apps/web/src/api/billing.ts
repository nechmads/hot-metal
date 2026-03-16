/**
 * Billing API routes.
 *
 * Authenticated routes for subscription management:
 * - GET /billing/subscription — current subscription info
 * - POST /billing/portal-session — create Paddle customer portal URL
 * - POST /billing/cancel — cancel subscription (end of billing period)
 */

import { Hono } from 'hono'
import { logger } from '@hotmetal/shared'
import type { AppEnv } from '../server'

const billing = new Hono<AppEnv>()

// Guard: all billing routes require PADDLE_API_KEY
billing.use('*', async (c, next) => {
	if (!c.env.PADDLE_API_KEY) {
		logger('web').error('PADDLE_API_KEY not configured', { component: 'billing' })
		return c.json({ error: 'Billing not configured' }, 503)
	}
	await next()
})

function paddleApiBase(env: Env): string {
	return env.PADDLE_ENVIRONMENT === 'sandbox'
		? 'https://sandbox-api.paddle.com'
		: 'https://api.paddle.com'
}

async function paddleFetch(env: Env, method: string, path: string, body?: object): Promise<Response> {
	return fetch(`${paddleApiBase(env)}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${env.PADDLE_API_KEY}`,
		},
		body: body ? JSON.stringify(body) : undefined,
	})
}

// ─── GET /billing/subscription ─────────────────────────────────────

billing.get('/billing/subscription', async (c) => {
	const userId = c.get('userId')
	const subscription = await c.env.DAL.getSubscriptionByUserId(userId)

	if (!subscription) {
		return c.json({
			hasSubscription: false,
			tier: 'creator',
			status: 'none',
		})
	}

	return c.json({
		hasSubscription: true,
		tier: subscription.tier,
		status: subscription.status,
		paddleSubscriptionId: subscription.paddleSubscriptionId,
		currentPeriodEnd: subscription.currentPeriodEnd,
		canceledAt: subscription.canceledAt,
	})
})

// ─── POST /billing/portal-session ──────────────────────────────────

billing.post('/billing/portal-session', async (c) => {
	const userId = c.get('userId')
	const subscription = await c.env.DAL.getSubscriptionByUserId(userId)

	if (!subscription) {
		return c.json({ error: 'No active subscription' }, 404)
	}

	const res = await paddleFetch(
		c.env,
		'POST',
		`/customers/${subscription.paddleCustomerId}/portal-sessions`,
		{
			subscription_ids: [subscription.paddleSubscriptionId],
		},
	)

	if (!res.ok) {
		const err = await res.text()
		logger('web').error('Failed to create portal session', { component: 'billing', error: err })
		return c.json({ error: 'Failed to create billing portal session' }, 502)
	}

	const data = (await res.json()) as {
		data: {
			urls: {
				general: { overview: string }
			}
		}
	}

	return c.json({ url: data.data.urls.general.overview })
})

// ─── POST /billing/cancel ──────────────────────────────────────────

billing.post('/billing/cancel', async (c) => {
	const userId = c.get('userId')
	const subscription = await c.env.DAL.getSubscriptionByUserId(userId)

	if (!subscription) {
		return c.json({ error: 'No active subscription' }, 404)
	}

	if (subscription.status === 'canceled') {
		return c.json({ error: 'Subscription already canceled' }, 400)
	}

	// Cancel at end of billing period (not immediately)
	const res = await paddleFetch(
		c.env,
		'POST',
		`/subscriptions/${subscription.paddleSubscriptionId}/cancel`,
		{
			effective_from: 'next_billing_period',
		},
	)

	if (!res.ok) {
		const err = await res.text()
		logger('web').error('Failed to cancel subscription', { component: 'billing', error: err })
		return c.json({ error: 'Failed to cancel subscription' }, 502)
	}

	// Update local DB so the UI reflects canceled state immediately
	await c.env.DAL.updateSubscription(userId, {
		status: 'canceled',
		canceledAt: new Date().toISOString(),
	})

	return c.json({ success: true, message: 'Subscription will be canceled at end of billing period' })
})

export default billing
