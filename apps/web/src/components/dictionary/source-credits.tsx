import type { SourceCredit } from '@zenbu/dictionary-core/sources/credits'
import { ChevronDownIcon } from 'lucide-react'

const linkClass = 'underline underline-offset-2 hover:text-foreground'

export function SourceCreditItem({
  source,
  linkClassName
}: {
  source: SourceCredit
  linkClassName?: string
}) {
  return (
    <li>
      <a href={source.url} className={linkClassName}>
        {source.name}
      </a>
      : {source.credit}{' '}
      {source.license.url ? (
        <a href={source.license.url} className={linkClassName}>
          {source.license.name}
        </a>
      ) : (
        source.license.name
      )}
      .{source.notice ? ` ${source.notice}` : null}
    </li>
  )
}

export function SourceCredits({ sources }: { sources: SourceCredit[] }) {
  return (
    <footer className="border-t pt-4 text-xs text-muted-foreground">
      <details className="group">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm py-1 font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          Sources
          <ChevronDownIcon
            aria-hidden
            className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <ul className="mt-2 flex flex-col gap-1">
          {sources.map(source => (
            <SourceCreditItem key={source.id} source={source} linkClassName={linkClass} />
          ))}
        </ul>
      </details>
    </footer>
  )
}
