import { ChevronDownIcon } from 'lucide-react'
import type { Source } from '@/lib/dictionary/sources'

const linkClass = 'underline underline-offset-2 hover:text-foreground'

export function SourceCredits({ sources }: { sources: Source[] }) {
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
            <li key={source.name}>
              <a href={source.url} className={linkClass}>
                {source.name}
              </a>
              : {source.credit}{' '}
              {source.license.url ? (
                <a href={source.license.url} className={linkClass}>
                  {source.license.name}
                </a>
              ) : (
                source.license.name
              )}
              .
            </li>
          ))}
        </ul>
      </details>
    </footer>
  )
}
