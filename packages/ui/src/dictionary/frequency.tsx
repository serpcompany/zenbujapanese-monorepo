import type { FrequencyTier } from '@zenbu/dictionary-core/detail/frequency'
import { Badge } from '../components/badge'
import { FrequencyDot, SpokenTier } from './frequency-dot'

export interface ShownFrequency {
  source: string
  shownSource: string
  value: string
  tier: FrequencyTier | null
  spokenTier: string | null
}

export function FrequencyBadges({ frequency }: { frequency: ShownFrequency[] }) {
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
          {rank.shownSource}{' '}
          <span className="text-foreground tabular-nums">
            {rank.value}
            <SpokenTier text={rank.spokenTier} />
          </span>
        </Badge>
      ))}
    </div>
  )
}
