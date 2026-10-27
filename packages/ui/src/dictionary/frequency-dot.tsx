import type { FrequencyTier } from '@zenbu/dictionary-core/detail/frequency'

const tierColor: Record<FrequencyTier, string> = {
  veryCommon: 'bg-green-500',
  common: 'bg-yellow-500',
  moderate: 'bg-orange-500',
  uncommon: 'bg-red-500',
  rare: 'bg-neutral-400'
}

export function FrequencyDot({ tier }: { tier: FrequencyTier | null }) {
  return (
    <span
      aria-hidden
      className={`size-1.5 shrink-0 rounded-full ${tier ? tierColor[tier] : 'bg-muted-foreground'}`}
    />
  )
}

export function SpokenTier({ text }: { text: string | null }) {
  return text ? <span className="sr-only">{text}</span> : null
}
