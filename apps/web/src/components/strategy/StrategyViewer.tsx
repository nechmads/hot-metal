import type { Strategy } from '@/lib/projects-api'
import { StrategyDisplay } from './StrategyDisplay'

interface StrategyViewerProps {
  strategy: Strategy
}

export function StrategyViewer({ strategy }: StrategyViewerProps) {
  return <StrategyDisplay strategy={strategy} />
}
