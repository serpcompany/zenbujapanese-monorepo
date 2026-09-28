import { Badge } from '@/components/ui/badge'
import type { FrequencyBand, FrequencyRecord } from '@/lib/dictionary/records'

const bandColor: Record<FrequencyBand, string> = {
  veryCommon: 'bg-green-500',
  common: 'bg-yellow-500',
  uncommon: 'bg-orange-500',
  rare: 'bg-neutral-400'
}

export function FrequencyDot({ band }: { band: FrequencyBand }) {
  return <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${bandColor[band]}`} />
}

/** One chip per frequency dictionary that ranks or lists the word. */
export function FrequencyBadges({ frequency }: { frequency: FrequencyRecord[] }) {
  if (frequency.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {frequency.map(rank => (
        <Badge key={rank.source} variant="outline" className="gap-1.5 text-muted-foreground">
          <FrequencyDot band={rank.band} />
          {rank.source} <span className="text-foreground tabular-nums">{rank.value}</span>
        </Badge>
      ))}
    </div>
  )
}
