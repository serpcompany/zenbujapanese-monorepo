import Link from "next/link"
import { Search, Volume2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemTitle,
} from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { DictionaryResult } from "@/lib/prototype-data"
import { cn } from "@/lib/utils"

export function SiteHeader() {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link className="flex items-baseline gap-2 font-semibold tracking-tight" href="/prototype/dictionary">
          <span className="text-lg">Zenbu</span>
          <span className="hidden text-xs font-normal text-muted-foreground sm:inline">Japanese Dictionary</span>
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1">
          <Button nativeButton={false} render={<a href="#results" />} size="sm" variant="ghost">Dictionary</Button>
          <Button nativeButton={false} render={<a href="#about" />} size="sm" variant="ghost">About</Button>
        </nav>
      </div>
    </header>
  )
}

export function DictionarySearchIntro({ query, variant }: { query: string; variant: string }) {
  return (
    <section aria-labelledby="dictionary-title" className="space-y-3">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href="#">Home</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Dictionary</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Card>
        <CardHeader className="border-b">
          <CardTitle id="dictionary-title" className="text-xl sm:text-2xl">Japanese dictionary</CardTitle>
          <CardDescription>Search Japanese words, readings, kanji, or English meanings.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/prototype/dictionary" className="flex gap-2" method="get" role="search">
            <input name="variant" type="hidden" value={variant} />
            <InputGroup className="h-10">
              <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
              <InputGroupInput aria-label="Search the dictionary" defaultValue={query} name="search" placeholder="Try hello, 日本, or こんにちは" />
              <InputGroupAddon align="inline-end">
                <InputGroupButton className="h-8 px-4" type="submit" variant="default">Search</InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </form>
        </CardContent>
      </Card>
    </section>
  )
}

export function ResultsHeading({ count, query }: { count: number; query: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-medium text-primary">Search results</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">“{query}”</h1>
      </div>
      <p className="text-sm text-muted-foreground">{count} matches · sorted by relevance</p>
    </div>
  )
}

export function PitchAccent({ pitch }: { pitch: DictionaryResult["pitch"] }) {
  if (!pitch) return <span className="text-muted-foreground">Unavailable</span>
  return (
    <span aria-label={`Pitch accent${pitch.dropAfter === null ? " unknown" : ` drops after mora ${pitch.dropAfter}`}`} className="inline-flex items-end gap-0.5" lang="ja">
      {pitch.morae.map((mora, index) => {
        const high = pitch.dropAfter === 0 ? index > 0 : pitch.dropAfter !== null && index < pitch.dropAfter
        const drops = pitch.dropAfter !== null && pitch.dropAfter > 0 && index === pitch.dropAfter - 1
        return <span className={cn("pitch-mora", high && "pitch-high", drops && "pitch-drop")} key={`${mora}-${index}`}>{mora}</span>
      })}
    </span>
  )
}

export function ResultMetadata({ result }: { result: DictionaryResult }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
      {result.common ? <Badge variant="secondary">Common</Badge> : null}
      {result.partsOfSpeech.map((part) => <Badge key={part} variant="outline">{part}</Badge>)}
      <span>{result.frequency ? `Frequency #${result.frequency.toLocaleString()}` : "Frequency unavailable"}</span>
      <Separator className="hidden h-4 sm:block" orientation="vertical" />
      <span className="flex items-center gap-1.5"><span>Pitch</span><PitchAccent pitch={result.pitch} /></span>
    </div>
  )
}

export function ExampleSentence({ example }: { example: NonNullable<DictionaryResult["example"]> }) {
  return (
    <figure className="rounded-lg bg-muted/60 px-3 py-2.5">
      <blockquote className="font-medium" lang="ja">{example.japanese}</blockquote>
      <figcaption className="mt-1 text-sm text-muted-foreground">{example.english}</figcaption>
    </figure>
  )
}

export function ListenButton({ compact = false }: { compact?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button size={compact ? "sm" : "default"} variant="outline" />}>
        <Volume2 data-icon="inline-start" /> Listen
      </TooltipTrigger>
      <TooltipContent>Play native Japanese pronunciation</TooltipContent>
    </Tooltip>
  )
}

export function DictionaryResultItem({ result, density = "comfortable", showExample = true, surface = "outline" }: { result: DictionaryResult; density?: "comfortable" | "compact"; showExample?: boolean; surface?: "outline" | "plain" }) {
  return (
    <Item className={cn("items-start", density === "comfortable" ? "p-4 sm:p-5" : "p-3")} variant={surface === "outline" ? "outline" : "default"}>
      <ItemContent className="min-w-0 gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <ItemTitle className="line-clamp-none font-heading text-2xl" lang="ja">{result.headword}</ItemTitle>
            <ItemDescription className="line-clamp-none">{result.reading} · {result.romanization}</ItemDescription>
          </div>
          <ItemActions><ListenButton compact /></ItemActions>
        </div>
        <ol className="ml-5 list-decimal space-y-1 text-sm leading-relaxed sm:text-base">
          {result.meanings.map((meaning) => <li key={meaning}>{meaning}</li>)}
        </ol>
        <ResultMetadata result={result} />
      </ItemContent>
      {showExample && result.example ? <ItemFooter className="mt-1 block"><ExampleSentence example={result.example} /></ItemFooter> : null}
    </Item>
  )
}

export function SiteFooter() {
  return (
    <footer id="about" className="mt-14">
      <Separator />
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Zenbu Japanese · Built for quick, useful lookups.</p>
        <nav aria-label="Footer" className="flex gap-1">
          <Button nativeButton={false} render={<a href="#" />} size="sm" variant="link">Data sources</Button>
          <Button nativeButton={false} render={<a href="#" />} size="sm" variant="link">Privacy</Button>
        </nav>
      </div>
    </footer>
  )
}
