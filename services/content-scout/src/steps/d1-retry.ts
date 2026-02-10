/**
 * Retry a D1 operation with exponential backoff.
 *
 * Handles transient SQLITE_BUSY errors that occur when multiple wrangler dev
 * processes share the same local D1 SQLite file via --persist-to.
 * Miniflare sets busy_timeout=0, so any concurrent write immediately fails.
 */
export async function runWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (err) {
      const isRetryable = attempt < maxRetries && isTransientD1Error(err)
      if (!isRetryable) throw err
      const delay = 100 * 2 ** attempt // 100ms, 200ms, 400ms
      console.warn(
        `D1 transient error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`,
        err instanceof Error ? err.message : String(err),
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw new Error(`D1 operation failed after ${maxRetries + 1} attempts`)
}

function isTransientD1Error(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message
  return (
    msg.includes('SQLITE_BUSY') ||
    msg.includes('SQLITE_LOCKED') ||
    msg.includes('database is locked') ||
    // Miniflare wraps SQLITE_BUSY as "internal error" in the D1 API response
    msg.includes('internal error')
  )
}
