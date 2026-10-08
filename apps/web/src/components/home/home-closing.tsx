import Image from 'next/image'
import { SourceCredits } from '@/components/dictionary/source-credits'
import { callToAction } from '@/components/home/home-styles'
import { GetAppButton } from '@/components/site-actions'
import { type AppPart, collageColumns, pageEnd } from '@/lib/app-parts'
import { pageSources } from '@/lib/dictionary/sources'

function PartCard({ part }: { part: AppPart }) {
  return (
    <div className="flex w-48 flex-col gap-1 rounded-xl bg-card p-2 pb-3 shadow-[0_18px_36px_-20px_rgb(0_0_0/0.35)] ring-1 ring-foreground/10">
      <div className="mb-1.5 flex h-30 justify-center overflow-hidden rounded-lg bg-muted">
        <Image
          src={part.screenshot.src}
          alt=""
          width={part.screenshot.width}
          height={part.screenshot.height}
          unoptimized
          draggable={false}
          className="-mt-13 h-auto w-30 shrink-0 self-start rounded-[13.7%/6.3%] ring-1 ring-foreground/10"
        />
      </div>
      <span className="px-1 text-sm font-semibold">{part.name}</span>
      <span className="px-1 text-xs text-muted-foreground">{part.line}</span>
      <span className="mt-2 grid h-7 place-items-center rounded-md bg-muted text-xs font-medium">
        Learn more
      </span>
    </div>
  )
}

function AppCollage() {
  return (
    <div
      aria-hidden="true"
      className="relative order-first h-36 overflow-hidden border-b bg-muted/40 md:order-none md:-my-10 md:-mr-12 md:h-auto md:border-b-0 md:bg-transparent"
    >
      <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-[48%] scale-60 rotate-12 gap-4 md:-translate-x-[45%] md:-translate-y-1/2 md:scale-100">
        {collageColumns.map((column, columnIndex) => (
          <div
            key={column[0]?.name}
            className={columnIndex ? 'mt-20 flex flex-col gap-4' : 'flex flex-col gap-4'}
          >
            {column.map((part, index) => (
              <PartCard key={`${part.name}-${index}`} part={part} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function HomeClosing() {
  return (
    <section aria-labelledby="page-end-title" className="border-t bg-muted/50 dark:bg-muted/30">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-14 md:px-5 md:py-20">
        <div className="flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 md:grid md:max-h-80 md:grid-cols-2 md:px-12 md:py-10">
          <div className="flex flex-col items-start gap-3.5 p-6 md:self-center md:p-0">
            <h2
              id="page-end-title"
              className="max-w-120 text-[1.625rem] leading-tight font-semibold tracking-tight text-balance md:text-[2rem]"
            >
              {pageEnd.title}
            </h2>
            <p className="text-muted-foreground">{pageEnd.line}</p>
            <GetAppButton size="lg" className={callToAction} />
          </div>
          <AppCollage />
        </div>
        <SourceCredits sources={pageSources.home} />
      </div>
    </section>
  )
}
