import { Suspense } from "react"
import Link from "next/link"
import { ArrowRight, ChevronRight, Headphones, Languages, Search, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PrototypeSwitcher } from "@/components/prototype-switcher"
import { additionalMatches, bestMatches, selectedEntry, type DictionaryResult } from "./fixture"

type PageProps = { searchParams: Promise<{ variant?: string }> }

const resultHref = (entry: DictionaryResult) => `/prototype/dictionary/entry/${entry.headword}-${entry.id}`

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/prototype/dictionary?variant=A" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">全</span>
      {compact ? null : <span>Zenbu Japanese</span>}
    </Link>
  )
}

function SearchForm({ compact = false, variant }: { compact?: boolean; variant: "A" | "B" | "C" }) {
  return (
    <form role="search" className="flex w-full items-center gap-2" action="/prototype/dictionary">
      <input type="hidden" name="variant" value={variant} />
      <label htmlFor={`dictionary-search-${compact ? "compact" : "standard"}`} className="sr-only">Search the Japanese dictionary</label>
      <div className="relative min-w-0 flex-1">
        <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input id={`dictionary-search-${compact ? "compact" : "standard"}`} name="search" defaultValue="hello" className="pl-9" />
      </div>
      <Button type="submit" size={compact ? "icon" : "default"} aria-label={compact ? "Search" : undefined}>
        <Search className={compact ? "" : "sm:hidden"} />
        {compact ? null : <span className="hidden sm:inline">Search</span>}
      </Button>
    </form>
  )
}

function Meta({ entry, detailed = false }: { entry: DictionaryResult; detailed?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {entry.common ? <Badge>Common</Badge> : null}
      {entry.partsOfSpeech.map((part) => <Badge key={part} variant="outline">{part}</Badge>)}
      {entry.frequencyRank ? <Badge variant="secondary" className="tabular-nums">Frequency #{entry.frequencyRank.toLocaleString()}</Badge> : null}
      {detailed && entry.pitch ? <Badge variant="outline" className="border-pitch/30 text-pitch">Pitch available</Badge> : null}
    </div>
  )
}

function AudioButton({ compact = false }: { compact?: boolean }) {
  return (
    <Button type="button" variant="outline" size={compact ? "icon" : "sm"} aria-label={compact ? "Hear pronunciation" : undefined}>
      <Headphones />{compact ? null : "Hear"}
    </Button>
  )
}

function ResultCard({ entry }: { entry: DictionaryResult }) {
  return (
    <article className="group rounded-xl border bg-card p-5 shadow-sm transition hover:border-primary/30 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={resultHref(entry)} className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <h3 className="text-2xl font-semibold tracking-tight group-hover:text-primary">{entry.headword}</h3>
          </Link>
          <p className="mt-0.5 text-sm text-muted-foreground">{entry.reading} · {entry.romaji}</p>
        </div>
        <AudioButton compact />
      </div>
      <ol className="mt-4 space-y-1 text-[15px]">
        {entry.meanings.slice(0, 2).map((meaning, index) => <li key={meaning}><span className="mr-2 text-muted-foreground">{index + 1}.</span>{meaning}</li>)}
      </ol>
      <div className="mt-4"><Meta entry={entry} detailed /></div>
      {entry.example ? (
        <div className="mt-4 border-t pt-4 text-sm">
          <p className="font-medium">{entry.example.japanese}</p>
          <p className="mt-1 text-muted-foreground">{entry.example.english}</p>
        </div>
      ) : <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">No linked example</p>}
    </article>
  )
}

function SiteFooter() {
  return (
    <footer className="border-t px-5 py-8 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>Zenbu Japanese · Dictionary prototype</p>
        <nav aria-label="Footer" className="flex gap-5"><a href="#sources">Sources</a><a href="#about">About</a><a href="#app">iPhone app</a></nav>
      </div>
    </footer>
  )
}

function VariantA() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="border-b bg-background/95 px-5 py-4"><div className="mx-auto flex max-w-3xl items-center justify-between"><Brand /><Button variant="ghost" size="sm">日本語</Button></div></header>
      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <div className="mb-10">
          <p className="mb-3 text-sm font-medium text-primary">Japanese dictionary</p>
          <h1 className="max-w-xl text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">Look up Japanese without the clutter.</h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-muted-foreground">Clear meanings, natural examples, pronunciation, and pitch information in one calm reference view.</p>
          <div className="mt-7"><SearchForm variant="A" /></div>
        </div>
        <div className="mb-8 flex items-end justify-between border-b pb-4"><div><p className="text-sm text-muted-foreground">Results for</p><h2 className="text-2xl font-semibold">“hello”</h2></div><p className="text-sm text-muted-foreground">5 matches</p></div>
        <section aria-labelledby="best-a"><h2 id="best-a" className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Best matches</h2><div className="space-y-4">{bestMatches.map((entry) => <ResultCard key={entry.id} entry={entry} />)}</div></section>
        <section className="mt-10" aria-labelledby="additional-a"><h2 id="additional-a" className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Additional matches</h2><div className="space-y-4">{additionalMatches.map((entry) => <ResultCard key={entry.id} entry={entry} />)}</div></section>
      </main>
      <SiteFooter />
    </div>
  )
}

function PreviewEntry() {
  const entry = selectedEntry
  return (
    <article>
      <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium text-primary">Best match</p><h2 className="mt-2 text-5xl font-semibold tracking-tight sm:text-6xl">{entry.headword}</h2><p className="mt-2 text-lg text-muted-foreground">{entry.reading} · {entry.romaji}</p></div><AudioButton /></div>
      <div className="mt-6"><Meta entry={entry} detailed /></div>
      <section className="mt-8"><h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Meanings</h3><ol className="mt-4 space-y-3">{entry.meanings.map((meaning, index) => <li key={meaning} className="flex gap-3 text-lg"><span className="text-muted-foreground">{index + 1}</span><span>{meaning}</span></li>)}</ol></section>
      <section className="mt-8 rounded-xl bg-muted p-5"><div className="flex items-center justify-between"><h3 className="font-semibold">Pitch accent</h3><Languages className="size-4 text-pitch" /></div><p className="mt-3 text-2xl tracking-[0.12em]">{entry.pitch}</p></section>
      {entry.example ? <section className="mt-8 border-t pt-7"><h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Example</h3><p className="mt-4 text-lg font-medium">{entry.example.japanese}</p><p className="mt-2 text-muted-foreground">{entry.example.english}</p></section> : null}
      <Button asChild className="mt-8 w-full"><Link href={resultHref(entry)}>Open full entry <ArrowRight /></Link></Button>
    </article>
  )
}

function CompactResult({ entry, selected = false }: { entry: DictionaryResult; selected?: boolean }) {
  return (
    <Link href={resultHref(entry)} className={`block border-b px-4 py-4 outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected ? "bg-accent" : "hover:bg-muted/70"}`}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-xl font-semibold">{entry.headword}</p><p className="text-sm text-muted-foreground">{entry.reading}</p></div><ChevronRight className="mt-2 size-4 text-muted-foreground" /></div>
      <p className="mt-2 line-clamp-2 text-sm">{entry.meanings.join(" · ")}</p>
      <div className="mt-3"><Meta entry={entry} /></div>
    </Link>
  )
}

function VariantB() {
  return (
    <div className="min-h-screen bg-card pb-24">
      <header className="border-b px-5 py-3"><div className="mx-auto flex max-w-6xl items-center gap-6"><Brand /><div className="ml-auto hidden w-full max-w-lg md:block"><SearchForm compact variant="B" /></div><Button variant="ghost" size="sm">EN</Button></div></header>
      <main className="mx-auto max-w-6xl px-5 py-6">
        <div className="mb-5 md:hidden"><SearchForm compact variant="B" /></div>
        <div className="mb-5"><p className="text-sm text-muted-foreground">5 results</p><h1 className="text-2xl font-semibold tracking-tight">English matches for “hello”</h1></div>
        <div className="overflow-hidden rounded-2xl border bg-background shadow-sm lg:grid lg:min-h-[680px] lg:grid-cols-[370px_1fr]">
          <aside aria-label="Search results" className="border-b lg:border-b-0 lg:border-r"><div className="border-b bg-muted/60 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Best matches</div>{bestMatches.map((entry, index) => <CompactResult key={entry.id} entry={entry} selected={index === 0} />)}<div className="border-y bg-muted/60 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Additional matches</div>{additionalMatches.map((entry) => <CompactResult key={entry.id} entry={entry} />)}</aside>
          <div className="p-6 sm:p-9 lg:p-12"><PreviewEntry /></div>
        </div>
      </main>
    </div>
  )
}

function TableRow({ entry, best }: { entry: DictionaryResult; best: boolean }) {
  return (
    <article className="group border-b last:border-b-0">
      <div className="grid gap-3 px-4 py-5 sm:grid-cols-[minmax(160px,1.1fr)_minmax(220px,2fr)_130px_48px] sm:items-start sm:gap-5 sm:px-5">
        <div className="flex items-start justify-between sm:block"><div><Link href={resultHref(entry)} className="text-xl font-semibold hover:text-primary">{entry.headword}</Link><p className="text-sm text-muted-foreground">{entry.reading} · {entry.romaji}</p></div><span className="sm:hidden"><AudioButton compact /></span></div>
        <div><p className="font-medium">{entry.meanings[0]}</p>{entry.meanings.length > 1 ? <p className="mt-1 text-sm text-muted-foreground">+ {entry.meanings.length - 1} more {entry.meanings.length === 2 ? "meaning" : "meanings"}</p> : null}<div className="mt-2"><Meta entry={entry} /></div>{entry.example ? <p className="mt-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">Example:</span> {entry.example.japanese}</p> : null}</div>
        <dl className="flex gap-5 text-sm sm:block"><div><dt className="text-xs text-muted-foreground">Rank</dt><dd className="mt-1 tabular-nums">{entry.frequencyRank ? `#${entry.frequencyRank.toLocaleString()}` : "—"}</dd></div><div className="sm:mt-3"><dt className="text-xs text-muted-foreground">Pitch</dt><dd className="mt-1 text-pitch">{entry.pitch ?? "—"}</dd></div></dl>
        <div className="hidden sm:block"><AudioButton compact /></div>
      </div>
      {best ? <div className="h-0.5 bg-primary/60" /> : null}
    </article>
  )
}

function VariantC() {
  return (
    <div className="min-h-screen bg-muted/40 pb-24">
      <header className="border-b bg-card px-4 py-3"><div className="mx-auto flex max-w-7xl items-center gap-4"><Brand compact /><nav aria-label="Primary" className="hidden gap-5 text-sm font-medium md:flex"><a href="#dictionary">Dictionary</a><a href="#kanji">Kanji</a><a href="#sentences">Sentences</a></nav><div className="ml-auto w-full max-w-xl"><SearchForm compact variant="C" /></div></div></header>
      <main className="mx-auto max-w-7xl px-4 py-7">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-primary">Dictionary / Words</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">hello</h1><p className="mt-1 text-sm text-muted-foreground">Showing 5 Japanese matches</p></div><div className="flex gap-2"><Badge variant="default">Words 5</Badge><Badge variant="outline">Kanji 0</Badge></div></div>
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="hidden grid-cols-[minmax(160px,1.1fr)_minmax(220px,2fr)_130px_48px] gap-5 border-b bg-muted/60 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:grid"><span>Word</span><span>Meaning & context</span><span>Evidence</span><span><span className="sr-only">Audio</span></span></div>
          <div className="bg-accent/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em]">Best matches</div>{bestMatches.map((entry) => <TableRow key={entry.id} entry={entry} best />)}
          <div className="border-y bg-muted/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Additional matches</div>{additionalMatches.map((entry) => <TableRow key={entry.id} entry={entry} best={false} />)}
        </div>
        <aside className="mt-5 flex items-start gap-3 rounded-xl border bg-card p-4 text-sm text-muted-foreground"><Sparkles className="mt-0.5 size-4 shrink-0 text-primary" /><p><span className="font-medium text-foreground">Prototype note:</span> This direction prioritizes scanning. Full senses, relationships, and source details stay on the exact entry page.</p></aside>
      </main>
    </div>
  )
}

export default async function DictionaryPrototypePage({ searchParams }: PageProps) {
  const params = await searchParams
  const variant = ["A", "B", "C"].includes(params.variant ?? "") ? params.variant! : "A"
  return (
    <>
      {variant === "A" ? <VariantA /> : variant === "B" ? <VariantB /> : <VariantC />}
      <Suspense><PrototypeSwitcher current={variant} /></Suspense>
    </>
  )
}
