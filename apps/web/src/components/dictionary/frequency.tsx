import { Badge } from '@/components/ui/badge'
import type { FrequencyResult, FrequencyTier } from '@/lib/dictionary/detail/frequency'

/** The app's traffic-light scale (FrequencyRankChip.swift), gray for rare words. */
const tierColor: Record<FrequencyTier, string> = {
  veryCommon: 'bg-green-500',
  common: 'bg-yellow-500',
  moderate: 'bg-orange-500',
  uncommon: 'bg-red-500',
  rare: 'bg-neutral-400'
}

/** How common a rank is; a dictionary without the word gets the secondary color. */
export function FrequencyDot({ tier }: { tier: FrequencyTier | null }) {
  return (
    <span
      aria-hidden
      className={`size-1.5 shrink-0 rounded-full ${tier ? tierColor[tier] : 'bg-muted-foreground'}`}
    />
  )
}

/**
 * The dot's meaning for screen readers, after the rank as the app's accessibility label puts it
 * ("YouTube frequency rank 949, very common").
 */
export function SpokenTier({ result }: { result: FrequencyResult }) {
  return result.spokenTier ? <span className="sr-only">, {result.spokenTier}</span> : null
}

/** One chip per frequency dictionary that ranks or lists the word. */
export function FrequencyBadges({ frequency }: { frequency: FrequencyResult[] }) {
  if (frequency.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {frequency.map(rank => (
        <Badge
          key={rank.source}
          variant="outline"
          className="gap-1.5 text-muted-foreground"
          data-chip={rank.source}
        >
          <FrequencyDot tier={rank.tier} />
          {rank.source}{' '}
          <span className="text-foreground tabular-nums">
            {rank.value}
            <SpokenTier result={rank} />
          </span>
        </Badge>
      ))}
    </div>
  )
}
