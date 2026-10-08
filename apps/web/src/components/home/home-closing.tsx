import { PlaneIcon, SmartphoneIcon } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { RubyText } from '@/components/dictionary/ruby-text'
import { callToAction } from '@/components/home/home-styles'
import { SectionHeading } from '@/components/home/section-heading'
import { GetAppButton } from '@/components/site-actions'
import { buttonVariants } from '@/components/ui/button'
import { pageSources } from '@/lib/dictionary/sources'
import { offlinePreview, storedOnDevice } from '@/lib/home-previews'
import { linkTo } from '@/lib/site'
import { iphoneAppTitle } from '@/lib/site-menus'
import { cn } from '@/lib/utils'

const allProducts = linkTo('products')

const panel =
  'flex w-full max-w-76 flex-col gap-2.5 rounded-lg bg-card px-4 py-3.5 text-[0.8125rem] ring-1 ring-border'

function PanelTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 font-medium [&_svg]:size-3.5 [&_svg]:text-muted-foreground">
      {icon}
      {children}
    </p>
  )
}

function ClosingPromise({
  title,
  preview,
  children
}: {
  title: string
  preview: ReactNode
  children: ReactNode
}) {
  return (
    <li className="flex min-w-0 flex-col gap-2 border-t py-7 first:border-t-0 md:border-t-0 md:border-l md:px-6 md:pt-8 md:pb-2 md:first:border-l-0 md:first:pl-0">
      <h3 className="text-[1.0625rem] font-semibold tracking-tight">{title}</h3>
      <div className="order-first mb-3 flex min-h-34 items-center md:min-h-56">{preview}</div>
      <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{children}</p>
    </li>
  )
}

function OfflinePreview() {
  return (
    <div aria-hidden="true" className={panel}>
      <PanelTitle icon={<PlaneIcon />}>Airplane mode</PanelTitle>
      <div className="flex flex-col gap-0.5 border-t pt-2.5 text-muted-foreground">
        <RubyText
          segments={offlinePreview.ruby}
          className="text-xl leading-[1.6] font-medium text-foreground"
        />
        {offlinePreview.meaning}
      </div>
    </div>
  )
}

function StoredPreview() {
  return (
    <div aria-hidden="true" className={panel}>
      <PanelTitle icon={<SmartphoneIcon />}>Stored on this iPhone</PanelTitle>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-border">
        {storedOnDevice.map(item => (
          <span key={item} className="bg-background px-2.5 py-2">
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

const creditLink = 'underline-offset-3 hover:underline'

function SourcesPreview() {
  return (
    <dl aria-label="Licences" className={cn(panel, 'grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5')}>
      {pageSources.home.map(source => (
        <div key={source.name} className="contents">
          <dt className="font-medium">
            <a href={source.url} className={creditLink}>
              {source.name}
            </a>
          </dt>
          <dd className="text-xs leading-5 text-muted-foreground">
            {source.license.url ? (
              <a href={source.license.url} className={creditLink}>
                {source.license.name}
              </a>
            ) : (
              source.license.name
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function HomeClosing() {
  return (
    <section aria-labelledby="closing-title" className="dark bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-4 pt-16 pb-12 md:px-5 md:pt-20 md:pb-14">
        <SectionHeading
          id="closing-title"
          title="Your Japanese stays yours."
          aside="On your iPhone, from open data."
          className="max-w-none"
        />
        <ul className="mt-10 grid border-t md:grid-cols-3">
          <ClosingPromise title="Works offline" preview={<OfflinePreview />}>
            The dictionary is on your iPhone, so lookups work on a plane or underground.
          </ClosingPromise>
          <ClosingPromise title="No account, no ads" preview={<StoredPreview />}>
            Your lists, notes, known words, and saved conversations stay on your iPhone. There’s
            nothing to sign up for.
          </ClosingPromise>
          <ClosingPromise title="Built on open data" preview={<SourcesPreview />}>
            Words, kanji, sentences, and word frequencies come from open projects, each credited on
            the{' '}
            <Link href="/sources/" className="text-foreground underline underline-offset-3">
              Sources
            </Link>{' '}
            page.
          </ClosingPromise>
        </ul>
        <div className="mt-4 grid items-center gap-6 border-t pt-8 md:mt-10 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex items-center gap-4">
            <Image
              src="/app-icon.webp"
              alt=""
              width={48}
              height={48}
              unoptimized
              className="size-12 shrink-0 rounded-[22.5%] ring-1 ring-border"
            />
            <div>
              <h3 className="text-xl font-semibold tracking-tight">{iphoneAppTitle}</h3>
              <p className="text-[0.9375rem] text-muted-foreground">
                Dictionary, Image Search, Translate, and Player in one app.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <GetAppButton size="lg" className={callToAction} />
            <Link
              href={allProducts.href}
              data-link-target={allProducts.target}
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), callToAction)}
            >
              All products
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
