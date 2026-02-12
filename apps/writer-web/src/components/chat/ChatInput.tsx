import { useRef, useState } from 'react'
import { PaperPlaneRightIcon, StopIcon } from '@phosphor-icons/react'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  onStop?: () => void
}

export function ChatInput({ onSend, disabled, onStop }: ChatInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  return (
    <div className="flex items-end gap-2 border-t border-[#e5e7eb] bg-white p-3 dark:border-[#374151] dark:bg-[#0a0a0a]">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Describe your blog post idea..."
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-base text-[#0a0a0a] placeholder:text-[#6b7280] focus:border-[#d97706] focus:outline-none focus:ring-1 focus:ring-[#d97706] disabled:opacity-50 dark:border-[#374151] dark:bg-[#1a1a1a] dark:text-[#fafafa]"
      />
      {onStop ? (
        <button
          type="button"
          onClick={onStop}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#6b7280] text-white transition-colors hover:bg-[#4b5563]"
          aria-label="Stop generating"
        >
          <StopIcon size={16} />
        </button>
      ) : (
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#d97706] text-white transition-colors hover:bg-[#b45309] disabled:opacity-50"
          aria-label="Send message"
        >
          <PaperPlaneRightIcon size={16} />
        </button>
      )}
    </div>
  )
}
