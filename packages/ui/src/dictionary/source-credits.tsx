import type { SourceCredit } from '@zenbu/dictionary-core/sources/credits'
import { ChevronDownIcon } from 'lucide-react'
import { Fill } from '../lib/fill'

export interface SourceCreditsText {
  title: string
  credit: string
  creditWithNotice: string
}

export type ShownSourceCredit = Pick<SourceCredit, 'id' | 'name' | 'url' | 'credit' | 'license'> & {
  notice: string | null
}

const linkClass = 'underline underline-offset-2 hover:text-foreground'

export function SourceCreditItem({
  source,
  text,
  linkClassName
}: {
  source: ShownSourceCredit
  text: SourceCreditsText
  linkClassName?: string
}) {
  return (
    <li>
      <Fill
        template={source.notice ? text.creditWithNotice : text.credit}
        values={{
          name: (
            <a href={source.url} className={linkClassName}>
              {source.name}
            </a>
          ),
          credit: source.credit,
          license: source.license.url ? (
            <a href={source.license.url} className={linkClassName}>
              {source.license.name}
            </a>
          ) : (
            source.license.name
          ),
          notice: source.notice
        }}
      />
    </li>
  )
}

export function SourceCreditLine({
  source,
  text
}: {
  source: ShownSourceCredit
  text: SourceCreditsText
}) {
  return (
    <ul className="shrink-0 text-xs text-muted-foreground">
      <SourceCreditItem source={source} text={text} linkClassName={linkClass} />
    </ul>
  )
}

export function SourceCredits({
  sources,
  text
}: {
  sources: ShownSourceCredit[]
  text: SourceCreditsText
}) {
  return (
    <footer className="border-t pt-4 text-xs text-muted-foreground">
      <details className="group">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm py-1 font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          {text.title}
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
              text={text}
              linkClassName={linkClass}
            />
          ))}
        </ul>
      </details>
    </footer>
  )
}
