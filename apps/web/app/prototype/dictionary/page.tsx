import { ChevronDown, CirclePlay, Search, Volume2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { PrototypeSwitcher } from "./prototype-switcher";

// PROTOTYPE: three fresh dictionary-result directions, switchable via ?variant=.
type Entry = {
  id: string;
  headword: string;
  reading: string;
  meanings: string[];
  partOfSpeech: string;
  common: boolean;
  frequency: string | null;
  pitch: { low: string; high: string; drop: string };
  example?: { japanese: string; english: string };
};

const bestMatches: Entry[] = [
  {
    id: "greeting",
    headword: "今日は",
    reading: "こんにちは",
    meanings: ["hello", "good day", "good afternoon"],
    partOfSpeech: "Interjection",
    common: true,
    frequency: "#386",
    pitch: { low: "こ", high: "んにち", drop: "は" },
    example: {
      japanese: "こんにちは。いい天気ですね。",
      english: "Hello. Nice weather, isn’t it?",
    },
  },
];

const additionalMatches: Entry[] = [
  {
    id: "phone-hello",
    headword: "もしもし",
    reading: "もしもし",
    meanings: ["hello (on the phone)", "excuse me! (calling out to someone)"],
    partOfSpeech: "Interjection",
    common: true,
    frequency: "#7,928",
    pitch: { low: "も", high: "しも", drop: "し" },
    example: {
      japanese: "もしもし、田中さんですか。",
      english: "Hello, is this Ms. Tanaka?",
    },
  },
  {
    id: "loanword-hello",
    headword: "ハロー",
    reading: "ハロー",
    meanings: ["hello", "hallo", "hullo"],
    partOfSpeech: "Interjection",
    common: true,
    frequency: null,
    pitch: { low: "ハ", high: "ロ", drop: "ー" },
  },
  {
    id: "casual-hello",
    headword: "ちわ",
    reading: "ちわ",
    meanings: ["hello", "hi"],
    partOfSpeech: "Interjection · colloquial abbreviation",
    common: false,
    frequency: null,
    pitch: { low: "ち", high: "", drop: "わ" },
  },
];

const allEntries = [...bestMatches, ...additionalMatches];

function SiteHeader() {
  return (
    <header className="border-b bg-background/95">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <a className="flex items-center gap-2 font-semibold tracking-tight" href="#">
          <span aria-hidden="true" className="grid size-7 place-items-center rounded-md bg-brand text-sm font-bold text-white">
            全
          </span>
          Zenbu Japanese
        </a>
        <nav aria-label="Main navigation" className="flex items-center gap-1 text-sm">
          <a className="rounded-md px-3 py-2 font-medium hover:bg-muted" href="#dictionary">
            Dictionary
          </a>
          <a className="hidden rounded-md px-3 py-2 text-muted-foreground hover:bg-muted sm:block" href="#about">
            About
          </a>
        </nav>
      </div>
    </header>
  );
}

function SearchBar({ variant }: { variant: string }) {
  return (
    <form action="/prototype/dictionary" className="flex gap-2" method="get" role="search">
      <input name="variant" type="hidden" value={variant} />
      <div className="relative min-w-0 flex-1">
        <Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Search the dictionary" className="pl-9" defaultValue="hello" name="search" />
      </div>
      <Button className="h-11" type="submit">Search</Button>
    </form>
  );
}

function ListenButton({ compact = false }: { compact?: boolean }) {
  return (
    <Button aria-label="Listen to Japanese pronunciation" size={compact ? "icon" : "sm"} type="button" variant="outline">
      <Volume2 />
      {compact ? <span className="sr-only">Listen</span> : "Listen"}
    </Button>
  );
}

function PitchAccent({ entry, label = true }: { entry: Entry; label?: boolean }) {
  return (
    <span className="inline-flex items-end gap-2 whitespace-nowrap text-sm">
      {label ? <span className="text-xs text-muted-foreground">Pitch</span> : null}
      <span aria-label={`Pitch accent for ${entry.reading}`} className="inline-flex pb-0.5 font-medium text-primary">
        <span>{entry.pitch.low}</span>
        {entry.pitch.high ? <span className="pitch-rise pt-0.5">{entry.pitch.high}</span> : null}
        <span className="pitch-drop pt-0.5">{entry.pitch.drop}</span>
      </span>
    </span>
  );
}

function ResultHeading({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <p className="text-sm text-muted-foreground">Japanese results for</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">“hello”</h1>
      </div>
      <p className="text-sm text-muted-foreground">{count} matches in this prototype</p>
    </div>
  );
}

function EvidenceLine({ entry, divider = "·" }: { entry: Entry; divider?: string }) {
  const items: ReactNode[] = [
    <span key="pos">{entry.partOfSpeech}</span>,
    entry.common ? <span className="font-medium text-foreground" key="common">Common word</span> : null,
    <span key="frequency">{entry.frequency ? `Frequency ${entry.frequency}` : "No frequency rank"}</span>,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {items.map((item, index) => (
        <span className="contents" key={index}>
          {index > 0 ? <span aria-hidden="true">{divider}</span> : null}
          {item}
        </span>
      ))}
    </div>
  );
}

function VariantA({ variant }: { variant: string }) {
  return (
    <main>
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-5 pt-10 pb-32 sm:px-8 sm:pt-14">
        <section className="grid gap-6 border-b pb-8 md:grid-cols-[1fr_23rem] md:items-end">
          <ResultHeading count={allEntries.length} />
          <SearchBar variant={variant} />
        </section>

        <section aria-labelledby="best-a" className="pt-9">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-xs font-semibold tracking-[0.14em] text-brand uppercase" id="best-a">Best match</h2>
            <div className="h-px flex-1 bg-border" />
          </div>
          {bestMatches.map((entry, index) => <BriefResult entry={entry} index={index + 1} key={entry.id} featured />)}
        </section>

        <section aria-labelledby="additional-a" className="pt-10">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase" id="additional-a">Additional matches</h2>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="divide-y">
            {additionalMatches.map((entry, index) => <BriefResult entry={entry} index={index + 2} key={entry.id} />)}
          </div>
        </section>
      </div>
    </main>
  );
}

function BriefResult({ entry, featured = false, index }: { entry: Entry; featured?: boolean; index: number }) {
  return (
    <article className={cn("grid gap-5 py-7 sm:grid-cols-[3.5rem_12rem_1fr] sm:gap-7", featured && "rounded-xl bg-card px-5 shadow-sm ring-1 ring-border sm:px-7")}>
      <div className="hidden pt-1 text-sm tabular-nums text-muted-foreground sm:block">{String(index).padStart(2, "0")}</div>
      <div>
        <div className="flex items-start justify-between gap-3">
          <a className="text-3xl font-semibold tracking-tight hover:text-primary" href="#entry" lang="ja">{entry.headword}</a>
          <div className="sm:hidden"><ListenButton compact /></div>
        </div>
        <p className="mt-1 text-base text-muted-foreground" lang="ja">{entry.reading}</p>
        <div className="mt-4 hidden sm:block"><ListenButton /></div>
      </div>
      <div className="min-w-0">
        <ol className="space-y-1.5 font-medium">
          {entry.meanings.map((meaning, index) => <li key={meaning}><span className="mr-2 text-xs font-normal text-muted-foreground">{index + 1}</span>{meaning}</li>)}
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <EvidenceLine entry={entry} />
          <PitchAccent entry={entry} />
        </div>
        {entry.example ? (
          <blockquote className="mt-5 border-l-2 border-primary/35 pl-4 text-sm">
            <p className="font-medium" lang="ja">{entry.example.japanese}</p>
            <p className="mt-1 text-muted-foreground">{entry.example.english}</p>
          </blockquote>
        ) : (
          <p className="mt-5 text-xs text-muted-foreground">No linked example sentence</p>
        )}
      </div>
    </article>
  );
}

function VariantB({ variant }: { variant: string }) {
  return (
    <main className="bg-white">
      <SiteHeader />
      <section className="border-b bg-muted/45">
        <div className="mx-auto grid max-w-6xl gap-7 px-5 py-10 sm:px-8 lg:grid-cols-[1fr_30rem] lg:items-center lg:py-12">
          <ResultHeading count={allEntries.length} />
          <SearchBar variant={variant} />
        </div>
      </section>
      <div className="pb-32">
        <section aria-labelledby="best-b">
          <div className="mx-auto max-w-6xl px-5 pt-7 sm:px-8"><h2 className="text-sm font-semibold" id="best-b">Best match</h2></div>
          {bestMatches.map((entry) => <BandResult entry={entry} key={entry.id} tone="brand" />)}
        </section>
        <section aria-labelledby="additional-b">
          <div className="mx-auto max-w-6xl px-5 pt-10 sm:px-8"><h2 className="text-sm font-semibold" id="additional-b">Additional matches</h2></div>
          {additionalMatches.map((entry, index) => <BandResult entry={entry} key={entry.id} tone={index % 2 === 0 ? "blue" : "plain"} />)}
        </section>
      </div>
    </main>
  );
}

function BandResult({ entry, tone }: { entry: Entry; tone: "brand" | "blue" | "plain" }) {
  return (
    <article className={cn("mt-3 border-y", tone === "brand" && "border-brand/15 bg-brand-soft/60", tone === "blue" && "bg-accent/45", tone === "plain" && "bg-white")}>
      <div className="mx-auto grid max-w-6xl sm:grid-cols-[15rem_1fr] lg:grid-cols-[18rem_1fr]">
        <div className="flex items-start justify-between gap-4 border-b p-5 sm:min-h-64 sm:border-r sm:border-b-0 sm:p-8">
          <div>
            <a className="whitespace-nowrap text-4xl font-semibold tracking-tight hover:text-primary" href="#entry" lang="ja">{entry.headword}</a>
            <p className="mt-2 text-lg text-muted-foreground" lang="ja">{entry.reading}</p>
            <div className="mt-5"><PitchAccent entry={entry} label={false} /></div>
          </div>
          <ListenButton compact />
        </div>
        <div className="grid min-w-0 lg:grid-cols-[1fr_15rem]">
          <div className="p-5 sm:p-8">
            <p className="mb-3 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Meaning</p>
            <ol className="space-y-2 text-xl font-medium sm:text-2xl">
              {entry.meanings.map((meaning, index) => <li key={meaning}><span className="mr-3 align-middle text-xs font-normal text-muted-foreground">{index + 1}</span>{meaning}</li>)}
            </ol>
            {entry.example ? (
              <div className="mt-7 border-t pt-5">
                <p className="text-base font-medium" lang="ja">{entry.example.japanese}</p>
                <p className="mt-1 text-sm text-muted-foreground">{entry.example.english}</p>
              </div>
            ) : <p className="mt-7 border-t pt-5 text-sm text-muted-foreground">No linked example sentence</p>}
          </div>
          <aside className="border-t p-5 sm:p-8 lg:border-t-0 lg:border-l">
            <dl className="grid grid-cols-2 gap-5 text-sm lg:grid-cols-1">
              <div><dt className="text-xs text-muted-foreground">Part of speech</dt><dd className="mt-1 font-medium">{entry.partOfSpeech}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Frequency</dt><dd className="mt-1 font-medium">{entry.frequency ?? "No rank"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Usage</dt><dd className="mt-1 font-medium">{entry.common ? "Common" : "—"}</dd></div>
            </dl>
          </aside>
        </div>
      </div>
    </article>
  );
}

function VariantC({ variant }: { variant: string }) {
  return (
    <main className="min-h-svh bg-muted/30">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-5 pt-10 pb-32 sm:px-8 sm:pt-14">
        <div className="mx-auto max-w-2xl"><SearchBar variant={variant} /></div>
        <div className="mt-10"><ResultHeading count={allEntries.length} /></div>

        <section aria-labelledby="best-c" className="mt-8">
          <h2 className="mb-3 text-xs font-semibold tracking-[0.14em] text-brand uppercase" id="best-c">Best match</h2>
          {bestMatches.map((entry) => <OutlineResult defaultOpen entry={entry} key={entry.id} />)}
        </section>
        <section aria-labelledby="additional-c" className="mt-8">
          <h2 className="mb-3 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase" id="additional-c">Additional matches</h2>
          <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
            {additionalMatches.map((entry, index) => <OutlineResult defaultOpen={index === 0} entry={entry} key={entry.id} nested />)}
          </div>
        </section>
      </div>
    </main>
  );
}

function OutlineResult({ defaultOpen = false, entry, nested = false }: { defaultOpen?: boolean; entry: Entry; nested?: boolean }) {
  return (
    <details className={cn("group bg-card", nested ? "border-b last:border-b-0" : "rounded-xl border shadow-xs")} open={defaultOpen}>
      <summary className="grid list-none gap-4 p-5 marker:content-none sm:grid-cols-[10rem_1fr_auto] sm:items-center sm:p-6 [&::-webkit-details-marker]:hidden">
        <div>
          <span className="text-2xl font-semibold tracking-tight" lang="ja">{entry.headword}</span>
          <span className="ml-2 text-sm text-muted-foreground" lang="ja">{entry.reading}</span>
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{entry.meanings[0]}</p>
          <div className="mt-1"><EvidenceLine entry={entry} /></div>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <PitchAccent entry={entry} label={false} />
          <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <div className="border-t bg-muted/35 px-5 py-6 sm:ml-40 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-[1fr_auto]">
          <div>
            <ol className="space-y-2">
              {entry.meanings.map((meaning, index) => <li className="font-medium" key={meaning}><span className="mr-2 text-xs font-normal text-muted-foreground">{index + 1}</span>{meaning}</li>)}
            </ol>
            {entry.example ? (
              <div className="mt-6 rounded-lg border bg-background p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><CirclePlay className="size-3.5" /> Example sentence</div>
                <p className="font-medium" lang="ja">{entry.example.japanese}</p>
                <p className="mt-1 text-sm text-muted-foreground">{entry.example.english}</p>
              </div>
            ) : <p className="mt-6 text-sm text-muted-foreground">No linked example sentence</p>}
          </div>
          <ListenButton />
        </div>
      </div>
    </details>
  );
}

export default async function DictionaryPrototype({ searchParams }: { searchParams: Promise<{ variant?: string }> }) {
  const requested = (await searchParams).variant?.toUpperCase();
  const variant = requested === "B" || requested === "C" ? requested : "A";

  return (
    <>
      {variant === "A" ? <VariantA variant={variant} /> : null}
      {variant === "B" ? <VariantB variant={variant} /> : null}
      {variant === "C" ? <VariantC variant={variant} /> : null}
      {process.env.NODE_ENV !== "production" ? <PrototypeSwitcher current={variant} /> : null}
    </>
  );
}
