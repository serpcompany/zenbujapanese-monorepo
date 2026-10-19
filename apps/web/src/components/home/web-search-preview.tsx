import { ChevronRightIcon } from 'lucide-react'
import { FrequencyBadges } from '@/components/dictionary/frequency'
import { RubyText } from '@/components/dictionary/ruby-text'
import { previewLabel, previewPanel } from '@/components/home/home-styles'
import { WordPreview } from '@/components/home/word-preview'
import { searchAddressIn, searchPreview } from '@/lib/home-previews'
import { type Locale, sourceLang } from '@/lib/i18n/config'
import { coreText } from '@/lib/i18n/core-text'
import { getDictionary } from '@/lib/i18n/dictionary'
import { site } from '@/lib/site'
import { siteMenusIn } from '@/lib/site-menus'
import { cn } from '@/lib/utils'

function BrowserBar({ locale }: { locale: Locale }) {
  return (
    <div className="flex h-9 items-center gap-2.5 border-b bg-muted/50 px-3">
      <span className="flex gap-1.5">
        {['close', 'minimize', 'zoom'].map(dot => (
          <span key={dot} className="size-2.5 rounded-full bg-foreground/15" />
        ))}
      </span>
      <span className="min-w-0 flex-1 truncate rounded-md bg-background px-2.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground ring-1 ring-foreground/10">
        {searchAddressIn(locale)}
      </span>
    </div>
  )
}

function SiteBar({ locale }: { locale: Locale }) {
  const previewNav = siteMenusIn(locale)
    .filter(menu => menu.kind === 'mega')
    .map(menu => menu.label)
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

function SearchPage({ locale }: { locale: Locale }) {
  const t = getDictionary(locale)
  return (
    <div className="flex max-w-120 flex-col gap-2 px-4 pt-4 pb-5">
      <div className="flex h-9 items-center justify-between overflow-hidden rounded-lg border border-input pl-3 text-sm">
        {searchPreview.query}
        <span className="flex h-full items-center border-l px-3 text-[0.8125rem] font-medium">
          {t.searchForm.submit}
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
          {coreText(link, locale)}
          <ChevronRightIcon className="size-3.5 text-muted-foreground" />
        </div>
      ))}
      <p className={cn(previewLabel, 'mt-1')}>{t.home.webPreview.results}</p>
      {searchPreview.results.map(result => (
        <div key={result.headword} className="flex flex-col gap-0.5 border-t pt-2">
          <RubyText segments={result.ruby} className="text-lg leading-[1.7] font-medium" />
          <span lang={sourceLang(locale)} className="text-[0.8125rem]">
            {result.meaning}
          </span>
          <FrequencyBadges frequency={result.chips} locale={locale} />
        </div>
      ))}
    </div>
  )
}

export function WebSearchPreview({ locale }: { locale: Locale }) {
  const { open, meaningTitle } = searchPreview
  return (
    <div aria-hidden="true" data-drawing className="@container relative min-w-0 pb-12">
      <div
        className={cn(
          previewPanel,
          'overflow-hidden rounded-xl shadow-[0_30px_60px_-30px_rgb(0_0_0/0.35)]'
        )}
      >
        <BrowserBar locale={locale} />
        <SiteBar locale={locale} />
        <SearchPage locale={locale} />
      </div>
      <WordPreview
        word={{ ...open, partOfSpeech: coreText(open.partOfSpeech, locale) }}
        meaningLabel={coreText(meaningTitle, locale)}
        meaningsLang={sourceLang(locale)}
        className="absolute right-0 bottom-0 w-[min(17rem,78%)] rounded-xl shadow-[0_24px_48px_-20px_rgb(0_0_0/0.4)] md:-right-4"
      />
    </div>
  )
}
