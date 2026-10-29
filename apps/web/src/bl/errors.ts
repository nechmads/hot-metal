export type BusinessErrorCode =
  'NOT_FOUND' | 'FORBIDDEN' | 'VALIDATION_ERROR' | 'QUOTA_EXCEEDED'

/** Business failures carry meaning; each transport owns its status/envelope mapping. */
export class BusinessError extends Error {
  constructor(
    message: string,
    public readonly code: BusinessErrorCode,
  ) {
    super(message)
    this.name = 'BusinessError'
  }
}

export class ResourceNotFoundError extends BusinessError {
  constructor(public readonly resource: 'publication' | 'topic' | 'user') {
    super(
      `${resource[0].toUpperCase()}${resource.slice(1)} not found`,
      'NOT_FOUND',
    )
    this.name = 'ResourceNotFoundError'
  }
}

export class BusinessForbiddenError extends BusinessError {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN')
    this.name = 'BusinessForbiddenError'
  }
}

export class BusinessValidationError extends BusinessError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR')
    this.name = 'BusinessValidationError'
  }
}

export class TopicQuotaExceededError extends BusinessError {
  constructor(
    public readonly limit: number,
    public readonly current: number,
    public readonly tier: string,
  ) {
    super('Topic quota exceeded', 'QUOTA_EXCEEDED')
    this.name = 'TopicQuotaExceededError'
  }
}
