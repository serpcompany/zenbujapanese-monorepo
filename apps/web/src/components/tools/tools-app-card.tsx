import { SearchIcon } from 'lucide-react'
import Link from 'next/link'
import { GetAppButton } from '@/components/site-actions'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ToolsAppCard({
  title,
  line,
  withDictionary = false
}: {
  title: string
  line: string
  withDictionary?: boolean
}) {
  return (
    <section aria-label="The Zenbu app">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{title}</h2>
          </CardTitle>
          <CardDescription className="col-start-1">{line}</CardDescription>
          <CardAction className="flex flex-wrap gap-2 max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-3 max-sm:mt-3 max-sm:justify-self-start">
            {withDictionary ? (
              <Button variant="outline" nativeButton={false} render={<Link href="/dictionary/" />}>
                <SearchIcon data-icon="inline-start" aria-hidden="true" />
                Dictionary
              </Button>
            ) : null}
            <GetAppButton />
          </CardAction>
        </CardHeader>
      </Card>
    </section>
  )
}
