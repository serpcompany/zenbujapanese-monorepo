import { ChevronRightIcon } from 'lucide-react'
import { FrequencyBadges } from '@/components/dictionary/frequency'
import { RubyText } from '@/components/dictionary/ruby-text'
import { previewPanel } from '@/components/home/app-extra-previews'
import { searchPreview } from '@/lib/home-previews'
import { site } from '@/lib/site'
import { siteMenus } from '@/lib/site-menus'
import { cn } from '@/lib/utils'

const sectionLabel = 'text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase'

const previewNav = siteMenus.filter(menu => menu.kind === 'mega').map(menu => menu.label)

function BrowserBar() {
  return (
    <div className="flex h-9 items-center gap-2.5 border-b bg-muted/50 px-3">
      <span className="flex gap-1.5">
        {['close', 'minimize', 'zoom'].map(dot => (
          <span key={dot} className="size-2.5 rounded-full bg-foreground/15" />
        ))}
      </span>
      <span className="min-w-0 flex-1 truncate rounded-md bg-background px-2.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground ring-1 ring-foreground/10">
        {searchPreview.address}
      </span>
    </div>
  )
}

function SiteBar() {
  return (
    <div className="flex h-10 items-center gap-2 border-b px-4 text-[0.8125rem] font-medium whitespace-nowrap">
      <span
        lang="ja"
        className="grid size-5 place-items-center rounded-[0.3rem] bg-primary text-[11px] text-primary-foreground"
      >
        {site.mark}
      </span>
      {site.name}
      <span className="ml-3 flex gap-1 text-xs font-normal text-muted-foreground @max-md:hidden">
        {previewNav.map((label, index) => (
          <span
            key={label}
            className={cn('rounded-md px-2 py-0.5', index === 0 && 'bg-muted text-foreground')}
          >
            {label}
          </span>
        ))}
      </span>
    </div>
  )
}

function SearchPage() {
  return (
    <div className="flex max-w-120 flex-col gap-2 px-4 pt-4 pb-5">
      <div className="flex h-9 items-center justify-between overflow-hidden rounded-lg border border-input pl-3 text-sm">
        {searchPreview.query}
        <span className="flex h-full items-center border-l px-3 text-[0.8125rem] font-medium">
          Search
        </span>
      </div>
      {searchPreview.links.map(link => (
        <div
          key={link}
          className={cn(
            previewPanel,
            'flex items-center justify-between gap-2 px-3 py-2 text-[0.8125rem] font-medium'
          )}
        >
          {link}
          <ChevronRightIcon className="size-3.5 text-muted-foreground" />
        </div>
      ))}
      <p className={cn(sectionLabel, 'mt-1')}>Results</p>
      {searchPreview.results.map(result => (
        <div key={result.headword} className="flex flex-col gap-0.5 border-t pt-2">
          <RubyText segments={result.ruby} className="text-lg leading-[1.7] font-medium" />
          <span className="text-[0.8125rem]">{result.meaning}</span>
          <FrequencyBadges frequency={result.chips} />
        </div>
      ))}
    </div>
  )
}

function WordCard() {
  const { ruby, partOfSpeech, meanings } = searchPreview.open
  return (
    <div
      className={cn(
        previewPanel,
        'absolute right-0 bottom-0 flex w-[min(17rem,78%)] flex-col gap-1.5 rounded-xl px-4 py-3.5 shadow-[0_24px_48px_-20px_rgb(0_0_0/0.4)] md:-right-4'
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <RubyText segments={ruby} className="text-2xl leading-[1.7] font-medium" />
        <span className="text-xs text-muted-foreground">{partOfSpeech}</span>
      </div>
      <p className={sectionLabel}>Meaning</p>
      <ol className="flex list-decimal flex-col gap-1 pl-4.5 text-[0.8125rem]">
        {meanings.map(meaning => (
          <li key={meaning}>{meaning}</li>
        ))}
      </ol>
    </div>
  )
}

export function WebSearchPreview() {
  return (
    <div aria-hidden="true" className="@container relative min-w-0 pb-12">
      <div
        className={cn(
          previewPanel,
          'overflow-hidden rounded-xl shadow-[0_30px_60px_-30px_rgb(0_0_0/0.35)]'
        )}
      >
        <BrowserBar />
        <SiteBar />
        <SearchPage />
      </div>
      <WordCard />
    </div>
  )
}
