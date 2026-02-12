import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/modal/Modal'
import { Loader } from '@/components/loader/Loader'
import { analyzeStyleUrl } from '@/lib/api'
import type { WritingStyle } from '@/lib/types'

const ANALYSIS_MESSAGES = [
  'Reading blog posts...',
  'Scanning for writing patterns...',
  'Studying sentence structure...',
  'Analyzing vocabulary choices...',
  'Mapping tone and voice...',
  'Detecting stylistic quirks...',
  'Comparing paragraph rhythms...',
  'Examining word frequency...',
  'Profiling the authorial voice...',
  'Building your style DNA...',
]

const ALMOST_THERE = 'Almost there, hang tight...'

function pickRandomMessage(exclude: string): string {
  const candidates = ANALYSIS_MESSAGES.filter((m) => m !== exclude)
  return candidates[Math.floor(Math.random() * candidates.length)]
}

interface StyleFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: { name: string; description: string; systemPrompt: string; toneGuide?: string; sourceUrl?: string; sampleText?: string }) => Promise<void>
  editingStyle?: WritingStyle | null
}

export function StyleFormModal({ isOpen, onClose, onSave, editingStyle }: StyleFormModalProps) {
  const [activeTab, setActiveTab] = useState<'prompt' | 'url'>('prompt')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [saving, setSaving] = useState(false)

  // URL analysis state
  const [url, setUrl] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [loadingMsg, setLoadingMsg] = useState(ANALYSIS_MESSAGES[0])
  const [toneGuide, setToneGuide] = useState<string | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [sampleText, setSampleText] = useState<string | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Reset form when opening/closing
  useEffect(() => {
    if (isOpen) {
      if (editingStyle) {
        setName(editingStyle.name)
        setDescription(editingStyle.description ?? '')
        setSystemPrompt(editingStyle.systemPrompt)
        setToneGuide(editingStyle.toneGuide)
        setSourceUrl(editingStyle.sourceUrl)
        setSampleText(editingStyle.sampleText)
        setActiveTab('prompt')
      } else {
        setName('')
        setDescription('')
        setSystemPrompt('')
        setToneGuide(null)
        setSourceUrl(null)
        setSampleText(null)
        setActiveTab('prompt')
      }
      setUrl('')
      setAnalyzing(false)
      setAnalyzeError(null)
      setSaving(false)
    }
  }, [isOpen, editingStyle])

  // Cycle loading messages during analysis: random every 4s, "almost there" every 5th
  useEffect(() => {
    if (analyzing) {
      const first = ANALYSIS_MESSAGES[Math.floor(Math.random() * ANALYSIS_MESSAGES.length)]
      setLoadingMsg(first)
      let tickCount = 0
      intervalRef.current = setInterval(() => {
        tickCount++
        if (tickCount % 5 === 0) {
          setLoadingMsg(ALMOST_THERE)
        } else {
          setLoadingMsg((prev) => pickRandomMessage(prev))
        }
      }, 4_000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [analyzing])

  const handleAnalyze = async () => {
    if (!url.trim() || analyzing) return
    setAnalyzing(true)
    setAnalyzeError(null)

    try {
      const result = await analyzeStyleUrl(url.trim())
      if (result.success && result.tone_guide) {
        setSystemPrompt(result.tone_guide.system_prompt)
        setToneGuide(JSON.stringify(result.tone_guide))
        setSourceUrl(url.trim())
        if (result.tone_guide.sample_rewrite) {
          setSampleText(result.tone_guide.sample_rewrite)
        }
        if (!name.trim()) {
          setName(`Style from ${new URL(url.trim()).hostname}`)
        }
        setActiveTab('prompt')
      } else {
        setAnalyzeError('Analysis returned no results. Try a different URL.')
      }
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleSave = async () => {
    if (saving || !name.trim() || !systemPrompt.trim()) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        systemPrompt: systemPrompt.trim(),
        toneGuide: toneGuide ?? undefined,
        sourceUrl: sourceUrl ?? undefined,
        sampleText: sampleText ?? undefined,
      })
      onClose()
    } catch {
      // Error handled by parent
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-lg">
      <div className="space-y-4 p-5">
        <h3 className="text-lg font-semibold">
          {editingStyle ? 'Edit Style' : 'Create Style'}
        </h3>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-[var(--color-border-default)] p-1">
          <button
            type="button"
            onClick={() => setActiveTab('prompt')}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'prompt'
                ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]'
            }`}
          >
            Write a prompt
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('url')}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'url'
                ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-card)]'
            }`}
          >
            Learn from URL
          </button>
        </div>

        {/* URL tab */}
        {activeTab === 'url' && (
          <div className="space-y-3">
            <p className="text-xs text-[var(--color-text-muted)]">
              Enter a blog URL and we'll analyze the writing style to create a matching profile. This can take a few minutes depending on the site.
            </p>

            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/blog"
                disabled={analyzing}
                className="flex-1 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={analyzing || !url.trim()}
                className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
              >
                {analyzing ? 'Analyzing...' : 'Analyze'}
              </button>
            </div>

            {analyzing && (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-3">
                <Loader size={16} />
                <span className="text-sm text-[var(--color-text-muted)]">
                  {loadingMsg}
                </span>
              </div>
            )}

            {analyzeError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {analyzeError}
              </div>
            )}
          </div>
        )}

        {/* Prompt tab / shared form fields */}
        {activeTab === 'prompt' && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., My Blog Voice"
                className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this style"
                className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">System Prompt</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={8}
                placeholder="Instructions for the AI writer. Describe the tone, voice, vocabulary, sentence structure, and any patterns to follow or avoid."
                className="w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                This prompt will be injected into the AI writer's system prompt to control writing style.
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-[var(--color-border-default)] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-bg-card)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim() || !systemPrompt.trim()}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {saving ? 'Saving...' : editingStyle ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
