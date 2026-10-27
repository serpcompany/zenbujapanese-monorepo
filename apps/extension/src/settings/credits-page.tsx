import { creditsShownBy } from '@zenbu/dictionary-core/sources/credits'
import { SourceCreditItem } from '@zenbu/ui/dictionary/source-credits'
import { settingsLabels } from './labels'

export function CreditsPage() {
  const { conversionNotice, credits } = creditsShownBy('extension')
  return (
    <>
      <p className="text-sm text-muted-foreground">{conversionNotice}</p>
      <ul className="flex flex-col gap-2 text-sm">
        {credits.map(source => (
          <SourceCreditItem
            key={source.id}
            source={{ ...source, notice: source.notice ?? null }}
            text={settingsLabels.credits}
            linkClassName="underline underline-offset-2 hover:text-muted-foreground"
          />
        ))}
      </ul>
    </>
  )
}
