import { SearchIcon } from 'lucide-react'
import Link from 'next/link'
import { GetAppButton } from '@/components/site-actions'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

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
      <Card className="flex-row flex-wrap items-center justify-between gap-4 px-5 py-5 md:px-6">
        <p className="text-[15px] text-pretty">
          <strong className="font-semibold">{title}</strong>{' '}
          <span className="text-muted-foreground">{line}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {withDictionary ? (
            <Button
              variant="outline"
              size="lg"
              nativeButton={false}
              render={<Link href="/dictionary/" />}
            >
              <SearchIcon data-icon="inline-start" aria-hidden="true" />
              Dictionary
            </Button>
          ) : null}
          <GetAppButton size="lg" />
        </div>
      </Card>
    </section>
  )
}
