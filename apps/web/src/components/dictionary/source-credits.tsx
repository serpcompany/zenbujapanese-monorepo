import type { Source } from '@/lib/dictionary/sources'

export function SourceCredits({ sources }: { sources: Source[] }) {
  return (
    <footer className="flex flex-col gap-1 border-t pt-4 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">Sources</p>
      <ul className="flex flex-col gap-1">
        {sources.map(source => (
          <li key={source.name}>
            <a href={source.url} className="underline underline-offset-2 hover:text-foreground">
              {source.name}
            </a>
            : {source.credit}{' '}
            {source.license.url ? (
              <a
                href={source.license.url}
                className="underline underline-offset-2 hover:text-foreground"
              >
                {source.license.name}
              </a>
            ) : (
              source.license.name
            )}
            .{source.notice ? ` ${source.notice}` : null}
          </li>
        ))}
      </ul>
    </footer>
  )
}
