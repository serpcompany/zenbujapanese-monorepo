import { RomajiLine } from '@zenbu/ui/dictionary/reading-aid-lines'
import { RubyText } from '@zenbu/ui/dictionary/ruby-text'
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from 'react'
import { type Gloss, type Glosses, glossOf } from '../page-lookup/annotate'
import { type GlossCache, type GlossLookUp, glossCache } from '../page-lookup/glosses'
import { type Found, wordIds } from '../page-lookup/rendering'
import { backoff, readText, type Segment, type Wait } from '../page-lookup/scan'
import { type PageToken, wordGroups } from '../page-lookup/words'
import type { Settings } from '../shared/settings'
import { useSettings } from '../shared/use-settings'
import { ReadingAids } from '../word-detail/reading-aids'
import { wordPopupLabels } from '../word-popup/labels'
import { hasOpenLayer } from '../word-popup/open-layer'
import type { PagePopup } from '../word-popup/page-popup'
import { WordPopup } from '../word-popup/word-popup'

export type SourceServices = {
  segment: Segment
  wait: Wait
  popupCard(languageReferenceID: string, frequency: readonly string[]): ReturnType<GlossLookUp>
  pagePopup?: PagePopup
}

const sourceClass = 'whitespace-pre-wrap text-muted-foreground'

const wordClass =
  'cursor-pointer rounded-sm underline decoration-blue-600 decoration-2 underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:decoration-blue-400'

function useFound(source: string, { segment, wait }: SourceServices): Found | null {
  const [found, setFound] = useState<Found | null>(null)
  useEffect(() => {
    let live = true
    const delay = backoff(wait)
    setFound(null)
    const read = () =>
      readText(source, segment).then(
        answer => {
          if (!live) return
          if (answer.type === 'found') setFound(answer.found)
          else if (answer.type === 'not-ready') delay.wait().then(retry)
        },
        () => undefined
      )
    const retry = () => {
      if (live) read()
    }
    read()
    return () => {
      live = false
    }
  }, [source, segment, wait])
  return found
}

export const lineGlosses = (services: SourceServices): GlossCache =>
  glossCache(id => services.popupCard(id, []))

function useGlosses(
  found: Found | null,
  on: boolean,
  services: SourceServices,
  shared: GlossCache | undefined
): Glosses {
  const cache = useMemo(() => shared ?? lineGlosses(services), [shared, services])
  const [, redraw] = useReducer((count: number) => count + 1, 0)
  useEffect(() => {
    if (!found || !on) return
    let live = true
    cache.fetch([...new Set(wordIds(found.tokens))]).then(() => {
      if (live) redraw()
    })
    return () => {
      live = false
    }
  }, [found, on, cache])
  return cache.known
}

function Words({
  group,
  gloss,
  pick
}: {
  group: readonly PageToken[]
  gloss: Gloss | null
  pick: PickWord
}) {
  const words = group.map(token =>
    token.ids.length === 0 ? (
      <RubyText key={token.start} segments={token.ruby} />
    ) : (
      <button
        key={token.start}
        type="button"
        data-word={token.text}
        data-start={token.start}
        className={wordClass}
        onPointerDown={keep}
        onClick={event => pick(token, event.currentTarget, fromKeys(event))}
      >
        <RubyText segments={token.ruby} />
      </button>
    )
  )
  if (group.every(token => token.ids.length === 0)) return words
  return (
    <span className="whitespace-nowrap">
      {gloss ? (
        <>
          <span>{words}</span>
          <span data-aid="meaning" lang={wordPopupLabels.lang} title={gloss.full}>
            <span aria-hidden="true">{gloss.short}</span>
            <span className="sr-only">{gloss.full}</span>
          </span>
        </>
      ) : (
        words
      )}
    </span>
  )
}

const keptPresses = new WeakSet<Event>()

const keep = (event: ReactPointerEvent) => void keptPresses.add(event.nativeEvent)

const fromKeys = (event: ReactMouseEvent) => event.detail === 0

type Picked = { token: PageToken; at: 'asking' | 'page' | 'inline'; id: number }

function usePicked(source: RefObject<HTMLParagraphElement | null>, pagePopup?: PagePopup) {
  const [picked, setPicked] = useState<Picked | null>(null)
  const asked = useRef(0)
  const closeOnPage = useRef<(() => void) | null>(null)
  const drop = useCallback(() => {
    asked.current += 1
    closeOnPage.current?.()
    closeOnPage.current = null
    setPicked(null)
  }, [])
  const pick = useCallback(
    (token: PageToken, word: HTMLElement, keys: boolean) => {
      const id = ++asked.current
      if (!pagePopup || keys) {
        closeOnPage.current?.()
        closeOnPage.current = null
        return setPicked({ token, at: 'inline', id })
      }
      const fromBottom = window.innerHeight - word.getBoundingClientRect().top
      const current = () => asked.current === id
      setPicked({ token, at: 'asking', id })
      closeOnPage.current = pagePopup(
        { text: token.text, ids: token.ids, fromBottom },
        {
          shown: () => current() && setPicked({ token, at: 'page', id }),
          closed: () => current() && drop(),
          unavailable: () => current() && setPicked({ token, at: 'inline', id })
        }
      )
    },
    [pagePopup, drop]
  )
  useEffect(() => () => closeOnPage.current?.(), [])
  const start = picked?.token.start
  useEffect(() => {
    if (start === undefined) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || hasOpenLayer(document)) return
      drop()
      source.current
        ?.querySelector<HTMLElement>(`[data-start="${start}"]`)
        ?.focus({ preventScroll: true })
    }
    const onPress = (event: PointerEvent) => {
      if (!keptPresses.has(event) && !hasOpenLayer(document)) drop()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPress)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPress)
    }
  }, [start, source, drop])
  return { picked, pick, drop }
}

type PickWord = (token: PageToken, word: HTMLElement, keys: boolean) => void

type LineProps = {
  settings: Settings
  services: SourceServices
  onPopup?(open: boolean, dismiss: () => void): void
  glosses?: GlossCache
  pick?: PickWord
}

function useReportPopup(popupOpen: boolean, onPopup: LineProps['onPopup'], drop: () => void) {
  useEffect(() => {
    if (!popupOpen || !onPopup) return
    onPopup(true, drop)
    return () => onPopup(false, drop)
  }, [popupOpen, onPopup, drop])
}

function Linked({
  found,
  settings,
  services,
  onPopup,
  glosses: shared,
  pick
}: LineProps & { found: Found }) {
  const glosses = useGlosses(found, settings['readingAids.wordMeanings'], services, shared)
  const source = useRef<HTMLParagraphElement>(null)
  const { picked, pick: pickHere, drop } = usePicked(source, services.pagePopup)
  useReportPopup(picked !== null, onPopup, drop)
  const frequency = settings['frequencyDictionaries.chosen']
  const lookUp = useCallback(
    (id: string) => services.popupCard(id, frequency),
    [services, frequency]
  )
  return (
    <ReadingAids settings={settings} className="flex flex-col gap-1">
      <p ref={source} lang="ja" data-source className={`${sourceClass} leading-loose`}>
        {wordGroups(found.tokens).map(group => (
          <Words
            key={group[0].start}
            group={group}
            gloss={glossOf(group, glosses)}
            pick={pick ?? pickHere}
          />
        ))}
      </p>
      <RomajiLine romaji={found.romaji} className="text-sm" />
      {picked?.at === 'inline' ? (
        <section className="pt-2 [&_[data-word-popup]]:max-w-full" onPointerDown={keep}>
          <WordPopup
            key={picked.id}
            text={picked.token.text}
            ids={picked.token.ids}
            lookUp={lookUp}
            settings={settings}
          />
        </section>
      ) : null}
    </ReadingAids>
  )
}

export function SourceLine({
  source,
  settings,
  ...line
}: Omit<LineProps, 'settings'> & { source: string; settings: Settings | null }) {
  const found = useFound(source, line.services)
  if (!found || !settings) {
    return (
      <p lang="ja" data-source className={sourceClass}>
        {source}
      </p>
    )
  }
  return <Linked found={found} settings={settings} {...line} />
}

export function SourceWords({ source, services }: { source: string; services: SourceServices }) {
  const settings = useSettings()
  return <SourceLine source={source} settings={settings} services={services} />
}
