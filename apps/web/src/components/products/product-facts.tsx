import type { AppStoreRelease } from '@/lib/app-store'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import { cn } from '@/lib/utils'

export function ProductFacts({
  platform,
  release,
  locale
}: {
  platform: string
  release: AppStoreRelease | null
  locale: Locale
}) {
  const t = getDictionary(locale).productPage.facts
  const facts = [
    { term: t.platform, detail: platform },
    ...(release
      ? [
          { term: t.requires, detail: fill(t.minimumOs, { version: release.minimumOsVersion }) },
          { term: t.version, detail: release.version }
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
