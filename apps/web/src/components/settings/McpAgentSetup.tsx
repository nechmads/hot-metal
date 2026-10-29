import { useEffect, useRef, useState } from 'react'
import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { HOTMETAL_SETUP_PROMPT, HOTMETAL_SKILL_URL } from '@/lib/mcp-onboarding'

const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]'

export function McpAgentSetup() {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  )
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prompt = useRef<HTMLTextAreaElement>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const copyPrompt = async () => {
    if (timer.current) clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(HOTMETAL_SETUP_PROMPT)
      setCopyState('copied')
      timer.current = setTimeout(() => setCopyState('idle'), 2500)
    } catch {
      setCopyState('failed')
      prompt.current?.focus()
      prompt.current?.select()
    }
  }

  return (
    <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-4">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
        Set up your assistant
      </h3>
      <p
        id="mcp-setup-description"
        className="mt-1 text-sm leading-relaxed text-[var(--color-text-muted)] dark:text-gray-400"
      >
        Paste this prompt into your assistant to connect to Hot Metal and load
        its usage guide. Your assistant may ask you to add the connector in its
        settings.
      </p>
      <label htmlFor="mcp-setup-prompt" className="sr-only">
        Assistant setup prompt
      </label>
      <textarea
        ref={prompt}
        id="mcp-setup-prompt"
        aria-describedby="mcp-setup-description"
        readOnly
        value={HOTMETAL_SETUP_PROMPT}
        rows={8}
        spellCheck={false}
        className={`mt-3 block w-full resize-y rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] p-3 text-sm leading-relaxed text-[var(--color-text-primary)] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 ${focus}`}
      />
      {copyState === 'failed' && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          Unable to copy automatically. The prompt is selected above; copy it
          manually.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => void copyPrompt()}
          aria-label="Copy assistant setup prompt"
          className={`flex min-h-11 items-center gap-2 rounded-lg border border-[var(--color-border-default)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-primary)] ${focus}`}
        >
          {copyState === 'copied' ? (
            <CheckIcon size={15} aria-hidden="true" />
          ) : (
            <CopyIcon size={15} aria-hidden="true" />
          )}
          <span role="status">
            {copyState === 'copied' ? 'Copied' : 'Copy setup prompt'}
          </span>
        </button>
        <a
          href={HOTMETAL_SKILL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex min-h-11 items-center text-sm text-[var(--color-accent-hover)] underline dark:text-amber-400 ${focus}`}
        >
          Agent skill (SKILL.md)
        </a>
      </div>
    </div>
  )
}
