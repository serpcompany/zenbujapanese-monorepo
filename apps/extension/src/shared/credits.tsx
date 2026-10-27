import { creditsShownBy } from '@zenbu/dictionary-core/sources/credits'
import { SourceCreditItem } from '@zenbu/ui/dictionary/source-credits'
import { labels } from './labels'

export const extensionCredits = creditsShownBy('extension')

const linkClass = 'underline underline-offset-2 hover:text-foreground'

export function Credits() {
  return (
    <section className="flex flex-col gap-2 text-sm">
      <h2 className="font-heading text-base font-semibold">{labels.credits.title}</h2>
      <p className="text-muted-foreground">{extensionCredits.conversionNotice}</p>
      <ul data-credits className="flex flex-col gap-1 text-muted-foreground">
        {extensionCredits.credits.map(source => (
          <SourceCreditItem
            key={source.id}
            source={{ ...source, notice: source.notice ?? null }}
            text={labels.credits}
            linkClassName={linkClass}
          />
        ))}
      </ul>
    </section>
  )
}
