import type { SourceCredit } from '@zenbu/dictionary-core/sources/credits'
import { ChevronDownIcon } from 'lucide-react'
import { Fill } from '@/components/fill'
import type { Locale } from '@/lib/i18n/config'
import { coreText } from '@/lib/i18n/core-text'
import { getDictionary } from '@/lib/i18n/dictionary'

const linkClass = 'underline underline-offset-2 hover:text-foreground'

export function SourceCreditItem({
  source,
  locale,
  linkClassName
}: {
  source: SourceCredit
  locale: Locale
  linkClassName?: string
}) {
  const t = getDictionary(locale).sourceCredits
  return (
    <li>
      <Fill
        template={source.notice ? t.creditWithNotice : t.credit}
        values={{
          name: (
            <a href={source.url} className={linkClassName}>
              {coreText(source.name, locale)}
            </a>
          ),
          credit: coreText(source.credit, locale),
          license: source.license.url ? (
            <a href={source.license.url} className={linkClassName}>
              {source.license.name}
            </a>
          ) : (
            source.license.name
          ),
          notice: source.notice ? coreText(source.notice, locale) : null
        }}
      />
    </li>
  )
}

export function SourceCredits({ sources, locale }: { sources: SourceCredit[]; locale: Locale }) {
  return (
    <footer className="border-t pt-4 text-xs text-muted-foreground">
      <details className="group">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm py-1 font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          {getDictionary(locale).sourceCredits.title}
          <ChevronDownIcon
            aria-hidden
            className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <ul className="mt-2 flex flex-col gap-1">
          {sources.map(source => (
            <SourceCreditItem
              key={source.id}
              source={source}
              locale={locale}
              linkClassName={linkClass}
            />
          ))}
        </ul>
      </details>
    </footer>
  )
}
