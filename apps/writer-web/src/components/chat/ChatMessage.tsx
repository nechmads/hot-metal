import type { UIMessage } from 'ai'
import { MemoizedMarkdown } from '@/components/memoized-markdown'
import { ToolCallIndicator } from './ToolCallIndicator'

interface ChatMessageProps {
  message: UIMessage
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    const text = getTextFromParts(message)
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-[#d97706] px-4 py-2.5 text-sm leading-relaxed text-white">
          <p className="whitespace-pre-wrap">{text}</p>
        </div>
      </div>
    )
  }

  // Assistant message — render parts
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2">
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            if (!part.text.trim()) return null
            return (
              <div
                key={i}
                className="rounded-2xl border border-[#e5e7eb] bg-[#f5f5f5] px-4 py-2.5 text-sm leading-relaxed text-[#0a0a0a] dark:border-[#374151] dark:bg-[#1a1a1a] dark:text-[#fafafa]"
              >
                <div className="prose max-w-none">
                  <MemoizedMarkdown content={part.text} id={`msg-${message.id}-${i}`} />
                </div>
              </div>
            )
          }

          // Handle tool invocations (both typed and dynamic)
          if (part.type === 'dynamic-tool' || part.type.startsWith('tool-')) {
            const toolPart = part as {
              type: string
              toolName?: string
              toolCallId: string
              state: string
              input?: unknown
            }
            // For typed tool parts, the tool name is in the type: "tool-{name}"
            const toolName = toolPart.toolName ?? part.type.replace(/^tool-/, '')
            return (
              <ToolCallIndicator
                key={toolPart.toolCallId}
                toolName={toolName}
                state={toolPart.state}
                input={toolPart.input}
              />
            )
          }

          return null
        })}
      </div>
    </div>
  )
}

function getTextFromParts(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}
