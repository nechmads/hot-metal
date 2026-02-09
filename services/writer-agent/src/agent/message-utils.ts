import type { UIMessage } from 'ai'
import { isStaticToolUIPart } from 'ai'

/**
 * Clean up incomplete tool calls from messages before sending to the model API.
 * Prevents API errors from interrupted or failed tool executions.
 *
 * Adapted from the Cloudflare agents-starter:
 * https://github.com/cloudflare/agents-starter/blob/main/src/utils.ts
 */
export function cleanupMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => {
    if (!message.parts) return true

    const hasIncompleteToolCall = message.parts.some((part) => {
      if (!isStaticToolUIPart(part)) return false
      return (
        part.state === 'input-streaming' ||
        (part.state === 'input-available' && !part.output && !part.errorText)
      )
    })

    return !hasIncompleteToolCall
  })
}
