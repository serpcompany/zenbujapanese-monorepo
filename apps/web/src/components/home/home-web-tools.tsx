import { ArrowRightIcon, ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import { Fill } from '@/components/fill'
import { SectionHeading } from '@/components/home/section-heading'
import { WebSearchPreview } from '@/components/home/web-search-preview'
import { menuItemClassName, SiteMenuItem } from '@/components/site-menu-item'
import { Card } from '@/components/ui/card'
import { Item } from '@/components/ui/item'
import { webToolsIn } from '@/lib/home'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'
import { linkTo } from '@/lib/site'
import { cn } from '@/lib/utils'

const allTools = linkTo('tools')

export function HomeWebTools({ locale }: { locale: Locale }) {
  const t = getDictionary(locale)
  const text = t.home.webTools
  return (
    <section aria-labelledby="web-title" className="border-y bg-muted/50">
      <div className="mx-auto grid w-full max-w-5xl items-center gap-10 px-4 py-14 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-12 md:px-5 md:py-20">
        <div className="flex min-w-0 flex-col items-start gap-5">
          <SectionHeading
            id="web-title"
            title={
              <Fill
                template={text.title}
                values={{ aside: <span className="text-muted-foreground">{text.aside}</span> }}
              />
            }
          />
          <p className="text-[1.0625rem] leading-relaxed text-pretty text-muted-foreground">
            {text.body}
          </p>
          <Card className="w-full gap-0 py-0">
            <ul aria-label={text.list} className="divide-y">
              {webToolsIn(locale).map(tool => (
                <li key={tool.href}>
                  <Item
                    render={<Link href={tool.href} data-link-target={tool.target} />}
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
            href={localizedPath(allTools.href, locale)}
            data-link-target={allTools.target}
            className="inline-flex items-center gap-1 text-sm font-medium hover:underline hover:underline-offset-4"
          >
            {t.menus.tools.footer.title}
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
        </div>
        <WebSearchPreview locale={locale} />
      </div>
    </section>
  )
}
