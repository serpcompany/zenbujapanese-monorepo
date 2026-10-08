import { SearchIcon } from 'lucide-react'
import Link from 'next/link'
import { GetAppButton } from '@/components/site-actions'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

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
          <CardDescription>{line}</CardDescription>
        </CardHeader>
        <CardFooter className="flex-wrap gap-2">
          {withDictionary ? (
            <Button variant="outline" nativeButton={false} render={<Link href="/dictionary/" />}>
              <SearchIcon data-icon="inline-start" aria-hidden="true" />
              Dictionary
            </Button>
          ) : null}
          <GetAppButton />
        </CardFooter>
      </Card>
    </section>
  )
}
