import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'hotmetal-panel-ratio'

interface UseResizablePanelOptions {
  defaultRatio?: number
  minRatio?: number
  maxRatio?: number
}

interface UseResizablePanelResult {
  ratio: number
  isMobile: boolean
  dividerProps: {
    onMouseDown: (e: React.MouseEvent) => void
    onTouchStart: (e: React.TouchEvent) => void
    onKeyDown: (e: React.KeyboardEvent) => void
  }
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function useResizablePanel({
  defaultRatio = 0.5,
  minRatio = 0.3,
  maxRatio = 0.7,
}: UseResizablePanelOptions = {}): UseResizablePanelResult {
  const [isMobile, setIsMobile] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const [ratio, setRatio] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = parseFloat(stored)
        if (!isNaN(parsed) && parsed >= minRatio && parsed <= maxRatio) {
          return parsed
        }
      }
    } catch {
      // localStorage unavailable
    }
    return defaultRatio
  })

  // Persist ratio
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(ratio))
    } catch {
      // ignore
    }
  }, [ratio])

  // Mobile detection
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches)
    }
    handler(mql)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const handleDrag = useCallback(
    (clientX: number) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const newRatio = (clientX - rect.left) / rect.width
      setRatio(Math.min(maxRatio, Math.max(minRatio, newRatio)))
    },
    [minRatio, maxRatio]
  )

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const onMouseMove = (ev: MouseEvent) => handleDrag(ev.clientX)
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [handleDrag]
  )

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0]
      if (!touch) return
      const onTouchMove = (ev: TouchEvent) => {
        const t = ev.touches[0]
        if (t) handleDrag(t.clientX)
      }
      const onTouchEnd = () => {
        document.removeEventListener('touchmove', onTouchMove)
        document.removeEventListener('touchend', onTouchEnd)
      }
      document.addEventListener('touchmove', onTouchMove)
      document.addEventListener('touchend', onTouchEnd)
    },
    [handleDrag]
  )

  const KEYBOARD_STEP = 0.05

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const delta = e.key === 'ArrowLeft' ? -KEYBOARD_STEP : KEYBOARD_STEP
        setRatio((prev) => Math.min(maxRatio, Math.max(minRatio, prev + delta)))
      }
    },
    [minRatio, maxRatio]
  )

  return {
    ratio,
    isMobile,
    dividerProps: { onMouseDown, onTouchStart, onKeyDown },
    containerRef,
  }
}
