import type { FrequencyResult } from '@zenbu/dictionary-core/detail/frequency'
import { Badge } from '@/components/ui/badge'
import type { Locale } from '@/lib/i18n/config'
import { coreText } from '@/lib/i18n/core-text'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { FrequencyDot, SpokenTier } from './frequency-dot'

export function FrequencyBadges({
  frequency,
  locale
}: {
  frequency: FrequencyResult[]
  locale: Locale
}) {
  if (frequency.length === 0) return null
  const t = getDictionary(locale).frequency
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
          {coreText(rank.source, locale)}{' '}
          <span className="text-foreground tabular-nums">
            {coreText(rank.value, locale)}
            <SpokenTier
              text={
                rank.spokenTier
                  ? fill(t.spokenTier, { tier: coreText(rank.spokenTier, locale) })
                  : null
              }
            />
          </span>
        </Badge>
      ))}
    </div>
  )
}
