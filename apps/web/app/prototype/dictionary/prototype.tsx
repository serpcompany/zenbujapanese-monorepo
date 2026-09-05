"use client"
// Three related dictionary result arrangements on a throwaway route.
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Menu, Search, Volume2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Item, ItemContent, ItemGroup, ItemHeader } from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import { words, type Word } from "./fixtures"
type Variant = "A" | "B" | "C"
const names = {
  A: "Inline examples",
  B: "Reading + evidence",
  C: "Expandable examples",
}
const nav = [
  { name: "Dictionary", href: "#search" },
  { name: "How to search", href: "#help" },
  { name: "About", href: "#about" },
]

// Tailark Mist header one, pinned source and adaptations in sources.md.
function SiteHeader() {
  const [open, setOpen] = useState(false)
  return (
    <header className="border-b">
      <nav className="mx-auto max-w-5xl px-6" aria-label="Main navigation">
        <div className="relative flex flex-wrap items-center justify-between gap-6 py-4 lg:gap-0">
          <div className="flex w-full justify-between gap-6 lg:w-auto">
            <Link
              href="/prototype/dictionary"
              className="flex items-center gap-2 text-lg font-semibold tracking-tight"
            >
              <span className="text-[#BC002D]">全部</span> zenbu
              <span className="font-normal text-muted-foreground">
                japanese
              </span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen(!open)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="site-menu"
            >
              {open ? <X /> : <Menu />}
            </Button>
          </div>
          <div
            id="site-menu"
            className={`${open ? "flex" : "hidden"} w-full flex-col gap-2 lg:flex lg:w-auto lg:flex-row`}
          >
            {nav.map((item) => (
              <Button
                key={item.name}
                nativeButton={false}
                render={<a href={item.href} onClick={() => setOpen(false)} />}
                variant="ghost"
              >
                {item.name}
              </Button>
            ))}
          </div>
        </div>
      </nav>
    </header>
  )
}
// Tailark Mist CTA one: same centered heading/action rhythm, action adapted to search.
function DictionarySearch({
  variant,
  search,
}: {
  variant: Variant
  search: string
}) {
  return (
    <section id="search">
      <div className="py-12">
        <div className="mx-auto max-w-5xl px-6">
          <div className="space-y-6 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-balance lg:text-4xl">
              Japanese dictionary
            </h1>
            <form
              action="/prototype/dictionary"
              className="mx-auto flex max-w-2xl justify-center gap-3"
              role="search"
            >
              <input type="hidden" name="variant" value={variant} />
              <InputGroup className="h-12 bg-background">
                <InputGroupAddon>
                  <Search aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  key={search}
                  name="search"
                  defaultValue={search}
                  placeholder="Japanese, English, or romaji"
                  aria-label="Dictionary search"
                  className="text-base"
                />
              </InputGroup>
              <Button size="lg" type="submit" className="h-12">
                Search
              </Button>
            </form>
            <p className="text-sm text-muted-foreground">
              Words, readings, and meanings. Japanese, English, or romaji.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
function ListenButton({ text }: { text: string }) {
  const [status, setStatus] = useState("")
  function listen() {
    if (!("speechSynthesis" in window)) {
      setStatus("Speech preview unavailable.")
      return
    }
    const voice = window.speechSynthesis
      .getVoices()
      .find((v) => v.lang.startsWith("ja"))
    if (!voice) {
      setStatus("No Japanese device voice installed.")
      return
    }
    window.speechSynthesis.cancel()
    const speech = new SpeechSynthesisUtterance(text)
    speech.lang = "ja-JP"
    speech.voice = voice
    speech.rate = 0.85
    speech.onend = () => setStatus("")
    speech.onerror = () => setStatus("Unable to play device voice.")
    setStatus("Playing device voice…")
    window.speechSynthesis.speak(speech)
  }
  useEffect(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices()
  }, [])
  return (
    <div>
      <Button
        size="sm"
        variant="ghost"
        onClick={listen}
        aria-label={`Listen to ${text} using device voice`}
        title="Device voice preview"
      >
        <Volume2 aria-hidden="true" />
        Listen
      </Button>
      <span
        className="block max-w-48 text-xs text-muted-foreground"
        role="status"
      >
        {status}
      </span>
    </div>
  )
}
function PitchAccent({ word }: { word: Word }) {
  const pitch = word.pitch
  if (!pitch)
    return (
      <p className="text-sm text-muted-foreground">Pitch accent unavailable</p>
    )
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-muted-foreground">Pitch</span>
      <span
        lang="ja"
        aria-label={`Illustrative pitch pattern, downstep ${pitch.drop}`}
        className="inline-flex py-1 text-base"
      >
        {pitch.mora.map((mora, i) => (
          <span
            key={i}
            style={{
              borderTop: pitch.high[i]
                ? "2px solid currentColor"
                : "2px solid transparent",
              borderBottom: !pitch.high[i]
                ? "2px solid currentColor"
                : "2px solid transparent",
              borderRight:
                i < pitch.high.length - 1 && pitch.high[i] !== pitch.high[i + 1]
                  ? "1px solid currentColor"
                  : undefined,
            }}
          >
            {mora}
          </span>
        ))}
      </span>
      <span className="text-muted-foreground">[{pitch.drop}]</span>
    </div>
  )
}
function ExampleSentence({ word }: { word: Word }) {
  if (!word.example)
    return (
      <p className="text-sm text-muted-foreground">
        No example sentence available.
      </p>
    )
  return (
    <figure className="space-y-1 border-l-2 border-border pl-4">
      <p lang="ja" className="text-base leading-7">
        {word.example.ja}
      </p>
      <figcaption className="text-sm text-muted-foreground">
        {word.example.en}
      </figcaption>
    </figure>
  )
}
function WordResult({ word, variant }: { word: Word; variant: Variant }) {
  return (
    <Item
      role="listitem"
      className="rounded-none border-0 border-b border-border px-0 py-7 last:border-b-0"
    >
      <ItemHeader className="items-start">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 lang="ja" className="text-2xl leading-9 font-medium">
            {word.word}
          </h3>
          <span className="text-sm text-muted-foreground">{word.romaji}</span>
          {word.common ? <Badge variant="secondary">Common</Badge> : null}
        </div>
        <ListenButton text={word.word} />
      </ItemHeader>
      <ItemContent
        className={`min-w-0 basis-full ${variant === "B" ? "grid gap-6 md:grid-cols-[1.2fr_1fr]" : "gap-4"}`}
      >
        <div className="space-y-3">
          <ol className="space-y-2">
            {word.senses.map((sense, i) => (
              <li key={i} className="flex gap-3 text-base leading-6">
                <span className="w-3 shrink-0 text-sm text-muted-foreground">
                  {i + 1}.
                </span>
                <div>
                  {sense.meanings}
                  <span className="ml-3 inline-block text-xs text-muted-foreground">
                    {sense.pos}
                  </span>
                </div>
              </li>
            ))}
          </ol>
          {word.note ? (
            <p className="text-sm leading-6 text-muted-foreground">
              {word.note}
            </p>
          ) : null}
        </div>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <PitchAccent word={word} />
            <p className="text-sm text-muted-foreground">
              {word.rank ? (
                <>
                  TUBELEX{" "}
                  <span className="font-medium text-foreground">
                    #{word.rank.toLocaleString("en-US")}
                  </span>
                </>
              ) : (
                "Frequency unavailable"
              )}
            </p>
          </div>
          {variant === "C" ? (
            <Accordion>
              <AccordionItem value="example">
                <AccordionTrigger className="text-muted-foreground">
                  Example sentence
                </AccordionTrigger>
                <AccordionContent>
                  <ExampleSentence word={word} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          ) : (
            <ExampleSentence word={word} />
          )}
        </div>
      </ItemContent>
    </Item>
  )
}
function ResultSection({
  title,
  items,
  variant,
}: {
  title: string
  items: Word[]
  variant: Variant
}) {
  return (
    <section aria-label={title}>
      <div className="flex items-center gap-3 border-b pb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      <ItemGroup className="gap-0">
        {items.map((word) => (
          <WordResult key={word.id} word={word} variant={variant} />
        ))}
      </ItemGroup>
    </section>
  )
}
// Tailark Mist footer one: centered brand, wrapping links, final small-print tiers.
function SiteFooter() {
  return (
    <footer id="about" className="bg-muted/50 py-12">
      <div className="mx-auto max-w-5xl px-6">
        <Link
          href="/prototype/dictionary"
          className="mx-auto block size-fit font-semibold"
        >
          zenbu japanese
        </Link>
        <div className="my-8 flex flex-wrap justify-center gap-6 text-sm">
          <a href="#search">Dictionary</a>
          <a href="#help">Search help</a>
          <a href="https://www.edrdg.org/jmdict/j_jmdict.html">JMdict</a>
          <a href="https://github.com/naist-nlp/tubelex">TUBELEX</a>
        </div>
        <p className="mx-auto max-w-xl text-center text-xs leading-5 text-muted-foreground">
          Design prototype · illustrative examples and pitch contours.
          <br />
          Listen uses your device’s Japanese voice, not a pronunciation
          recording.
          <br />© 2026 Zenbu Japanese
        </p>
      </div>
    </footer>
  )
}
function PrototypeSwitcher({ variant }: { variant: Variant }) {
  const router = useRouter()
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        (e.target instanceof HTMLElement &&
          e.target.closest(
            'input,textarea,select,[contenteditable="true"],[role="tablist"],[data-slot="accordion"]'
          ))
      )
        return
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
      e.preventDefault()
      const params = new URLSearchParams(window.location.search)
      params.set(
        "variant",
        ["A", "B", "C"][
          ("ABC".indexOf(variant) + (e.key === "ArrowRight" ? 1 : 2)) % 3
        ]
      )
      router.replace(`?${params}`, { scroll: false })
    }
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [variant, router])
  function change(step: number) {
    const params = new URLSearchParams(window.location.search)
    params.set(
      "variant",
      ["A", "B", "C"][("ABC".indexOf(variant) + step + 3) % 3]
    )
    router.replace(`?${params}`, { scroll: false })
  }
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border bg-background px-2 py-1 shadow-lg">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Previous design"
        onClick={() => change(-1)}
      >
        <ArrowLeft />
      </Button>
      <p className="text-center text-xs">
        <span className="text-muted-foreground">PROTOTYPE </span>
        {variant} · {names[variant]}
      </p>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next design"
        onClick={() => change(1)}
      >
        <ArrowRight />
      </Button>
    </div>
  )
}
export function DictionaryPrototype({
  variant,
  search,
}: {
  variant: Variant
  search: string
}) {
  const matches = search.trim().toLowerCase() === "hello"
  return (
    <>
      <SiteHeader />
      <main>
        <DictionarySearch variant={variant} search={search} />
        <Separator />
        <div className="mx-auto max-w-5xl space-y-10 px-6 py-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-medium">
              {matches ? "Results for “hello”" : `No fixture for “${search}”`}
            </h2>
            <p className="text-xs text-muted-foreground">
              {matches
                ? "5 words · English → Japanese"
                : "This preview supports hello only"}
            </p>
          </div>
          {matches ? (
            <>
              <ResultSection
                title="Best Matches"
                items={words.slice(0, 3)}
                variant={variant}
              />
              <ResultSection
                title="Additional Matches"
                items={words.slice(3)}
                variant={variant}
              />
            </>
          ) : (
            <Button
              nativeButton={false}
              render={<Link href={`?variant=${variant}&search=hello`} />}
            >
              Show hello results
            </Button>
          )}
          <section id="help" className="border-t py-6">
            <h2 className="mb-2 text-sm font-semibold">How to search</h2>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Enter a word, then choose Search. This design preview includes
              “hello”. Frequency numbers show a sample TUBELEX rank; lower means
              more frequent. Pitch and examples are illustrative fixtures for
              evaluating the layout.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
      {process.env.NODE_ENV !== "production" ? (
        <PrototypeSwitcher variant={variant} />
      ) : null}
    </>
  )
}
