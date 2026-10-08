import { ArrowRightIcon, CheckIcon } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { AppScreenshot } from '@/components/app-screenshot'
import { AppStoreButton } from '@/components/site-actions'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { featuredApp } from '@/lib/products/catalog'

export function FeaturedAppCard({ hidden }: { hidden?: boolean }) {
  return (
    <Card hidden={hidden} className="gap-0 py-0 md:col-span-2 md:grid md:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-3.5 p-6 md:justify-center md:p-8">
        <div className="flex items-center gap-3">
          <Image
            src={featuredApp.icon}
            alt=""
            width={48}
            height={48}
            unoptimized
            className="size-12 shrink-0 rounded-[22.5%]"
          />
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-lg font-semibold tracking-tight">{featuredApp.title}</h3>
            <div className="flex flex-wrap gap-1.5">
              {featuredApp.tags.map(tag => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {featuredApp.description}
        </p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {featuredApp.includes.map(item => (
            <li key={item} className="flex min-w-0 items-start gap-2">
              <CheckIcon aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground" />
              {item}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 pt-1">
          <AppStoreButton size="lg" />
          <Link
            href={featuredApp.page.href}
            data-link-target={featuredApp.page.target}
            className={buttonVariants({ variant: 'outline', size: 'lg' })}
          >
            Learn more
            <span className="sr-only"> about {featuredApp.title}</span>
            <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="flex h-68 justify-center gap-4 overflow-hidden border-t bg-muted pt-7 md:h-auto md:min-h-80 md:border-t-0 md:border-l">
        {featuredApp.screenshots.map((screenshot, index) => (
          <AppScreenshot
            key={screenshot.src}
            screenshot={screenshot}
            className={index === 0 ? 'w-40 self-start md:w-44' : 'mt-9 w-40 self-start md:w-44'}
          />
        ))}
      </div>
    </Card>
  )
}
