import { Button } from '@zenbu/ui/components/button'
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@zenbu/ui/components/card'
import { SearchIcon } from 'lucide-react'
import Link from 'next/link'
import { GetAppButton } from '@/components/site-actions'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'

export function ToolsAppCard({
  title,
  line,
  locale,
  withDictionary = false
}: {
  title: string
  line: string
  locale: Locale
  withDictionary?: boolean
}) {
  const t = getDictionary(locale)
  return (
    <section aria-label={t.tools.appCard.label}>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{title}</h2>
          </CardTitle>
          <CardDescription className="col-start-1">{line}</CardDescription>
          <CardAction className="flex flex-wrap gap-2 max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-3 max-sm:mt-3 max-sm:justify-self-start">
            {withDictionary ? (
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={localizedPath('/dictionary/', locale)} />}
              >
                <SearchIcon data-icon="inline-start" aria-hidden="true" />
                {t.tools.appCard.dictionary}
              </Button>
            ) : null}
            <GetAppButton locale={locale} label={t.chrome.getTheApp} />
          </CardAction>
        </CardHeader>
      </Card>
    </section>
  )
}
