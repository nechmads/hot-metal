/**
 * Typed error classes for the shared action layer.
 *
 * Action functions throw these; route handlers (both /api/* and /agents-api/*)
 * catch them and convert to the appropriate HTTP response.
 */

export class ActionError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly status: number,
	) {
		super(message)
		this.name = 'ActionError'
	}
}

export class NotFoundError extends ActionError {
	constructor(message = 'Resource not found') {
		super(message, 'NOT_FOUND', 404)
		this.name = 'NotFoundError'
	}
}

export class ForbiddenError extends ActionError {
	constructor(message = 'Forbidden') {
		super(message, 'FORBIDDEN', 403)
		this.name = 'ForbiddenError'
	}
}

export class ValidationError extends ActionError {
	constructor(message: string) {
		super(message, 'VALIDATION_ERROR', 400)
		this.name = 'ValidationError'
	}
}

export class ConflictError extends ActionError {
	constructor(message: string) {
		super(message, 'CONFLICT', 409)
		this.name = 'ConflictError'
	}
}

export class QuotaExceededError extends ActionError {
	constructor(
		message: string,
		public readonly limit: number,
		public readonly current: number,
	) {
		super(message, 'QUOTA_EXCEEDED', 403)
		this.name = 'QuotaExceededError'
	}
}
