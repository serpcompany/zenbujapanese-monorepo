import { Badge } from '@zenbu/ui/components/badge'
import { buttonVariants } from '@zenbu/ui/components/button'
import { Card } from '@zenbu/ui/components/card'
import { Fill } from '@zenbu/ui/lib/fill'
import { ArrowRightIcon, CheckIcon } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { AppScreenshot } from '@/components/app-screenshot'
import { AppStoreButton } from '@/components/site-actions'
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import type { CatalogApp } from '@/lib/products/localized-catalog'
import { cn } from '@/lib/utils'

type FeaturedAppText = Pick<Dictionary['products']['catalog'], 'learnMore' | 'about'> & {
  getTheApp: string
}

export function FeaturedAppCard({
  app,
  locale,
  text,
  hidden
}: {
  app: CatalogApp
  locale: Locale
  text: FeaturedAppText
  hidden?: boolean
}) {
  return (
    <Card hidden={hidden} className="gap-0 py-0 md:col-span-2 md:grid md:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-3.5 p-6 md:justify-center md:p-8">
        <div className="flex items-center gap-3">
          <Image
            src={app.icon}
            alt=""
            width={48}
            height={48}
            unoptimized
            className="size-12 shrink-0 rounded-[22.5%]"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-lg font-semibold tracking-tight">{app.title}</h3>
            <div className="flex flex-wrap gap-1.5">
              {app.tags.map(tag => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{app.description}</p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {app.includes.map(item => (
            <li key={item} className="flex min-w-0 items-start gap-2">
              <CheckIcon aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground" />
              {item}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 pt-1">
          <AppStoreButton locale={locale} label={text.getTheApp} size="lg" />
          <Link
            href={app.page.href}
            data-link-target={app.page.target}
            className={buttonVariants({ variant: 'outline', size: 'lg' })}
          >
            <Fill
              template={text.learnMore}
              values={{
                about: <span className="sr-only">{fill(text.about, { title: app.title })}</span>
              }}
            />
            <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="flex h-68 justify-center gap-4 overflow-hidden border-t bg-muted pt-7 md:h-auto md:min-h-80 md:border-t-0 md:border-l">
        {app.screenshots.map((screenshot, index) => (
          <AppScreenshot
            key={screenshot.src}
            screenshot={screenshot}
            className={cn('w-40 shrink-0 self-start md:w-44', index > 0 && 'mt-9')}
          />
        ))}
      </div>
    </Card>
  )
}
