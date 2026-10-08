import type { AppStoreRelease } from '@/lib/app-store'
import { cn } from '@/lib/utils'

export function ProductFacts({
  platform,
  release
}: {
  platform: string
  release: AppStoreRelease | null
}) {
  const facts = [
    { term: 'Platform', detail: platform },
    ...(release
      ? [
          { term: 'Requires', detail: `iOS ${release.minimumOsVersion} or later` },
          { term: 'Version', detail: release.version }
        ]
      : [])
  ]
  return (
    <dl
      className={cn(
        'grid w-full max-w-2xl grid-cols-2 gap-x-6 gap-y-3 border-t pt-4 text-center',
        release && 'md:grid-cols-3'
      )}
    >
      {facts.map(fact => (
        <div
          key={fact.term}
          className={cn('odd:last:col-span-2', release && 'md:odd:last:col-span-1')}
        >
          <dt className="text-xs text-muted-foreground">{fact.term}</dt>
          <dd className="text-[15px] font-medium">{fact.detail}</dd>
        </div>
      ))}
    </dl>
  )
}
