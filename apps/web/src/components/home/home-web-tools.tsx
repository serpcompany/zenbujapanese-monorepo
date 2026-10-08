import { ArrowRightIcon, ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import { SectionHeading } from '@/components/home/section-heading'
import { WebSearchPreview } from '@/components/home/web-search-preview'
import { menuItemClassName, SiteMenuItem } from '@/components/site-menu-item'
import { Card } from '@/components/ui/card'
import { Item } from '@/components/ui/item'
import { webTools } from '@/lib/home'
import { linkTo } from '@/lib/site'
import { cn } from '@/lib/utils'

const allTools = linkTo('tools')

export function HomeWebTools() {
  return (
    <section aria-labelledby="web-title" className="border-y bg-muted/50">
      <div className="mx-auto grid w-full max-w-5xl items-center gap-10 px-4 py-14 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-12 md:px-5 md:py-20">
        <div className="flex min-w-0 flex-col items-start gap-5">
          <SectionHeading
            id="web-title"
            title="Free on the web."
            aside="The app’s dictionary, in your browser."
          />
          <p className="text-[1.0625rem] leading-relaxed text-pretty text-muted-foreground">
            No download and no account. Every word has its own page, with readings, pitch accent,
            conjugations, kanji, and example sentences.
          </p>
          <Card className="w-full gap-0 py-0">
            <ul aria-label="Free tools" className="divide-y">
              {webTools.map(tool => (
                <li key={tool.href}>
                  <Item
                    render={<Link href={tool.href} />}
                    className={cn(menuItemClassName, 'flex-nowrap rounded-none px-4 py-3')}
                  >
                    <SiteMenuItem link={tool} />
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="ml-auto size-4 shrink-0 self-center text-muted-foreground"
                    />
                  </Item>
                </li>
              ))}
            </ul>
          </Card>
          <Link
            href={allTools.href}
            data-link-target={allTools.target}
            className="inline-flex items-center gap-1 text-sm font-medium hover:underline hover:underline-offset-4"
          >
            All free tools
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
        </div>
        <WebSearchPreview />
      </div>
    </section>
  )
}
