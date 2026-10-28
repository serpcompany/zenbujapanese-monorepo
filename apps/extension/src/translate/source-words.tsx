import { RomajiLine } from '@zenbu/ui/dictionary/reading-aid-lines'
import { RubyText } from '@zenbu/ui/dictionary/ruby-text'
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from 'react'
import { type Glosses, glossOf } from '../page-lookup/annotate'
import { type GlossCache, type GlossLookUp, glossCache } from '../page-lookup/glosses'
import { type Found, wordIds } from '../page-lookup/rendering'
import { backoff, readText, type Segment, type Wait } from '../page-lookup/scan'
import { type PageToken, wordGroups } from '../page-lookup/words'
import type { Settings } from '../shared/settings'
import { useSettings } from '../shared/use-settings'
import type { PanelPage } from '../side-panel/route'
import { ReadingAids } from '../word-detail/reading-aids'
import { wordPopupLabels } from '../word-popup/labels'
import { WordPopup } from '../word-popup/word-popup'

export type SourceServices = {
  segment: Segment
  wait: Wait
  popupCard(languageReferenceID: string, frequency: readonly string[]): ReturnType<GlossLookUp>
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
  gloss: string | null
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
        onClick={event => pick(token, event.currentTarget)}
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
          <span data-aid="meaning" lang={wordPopupLabels.lang}>
            {gloss}
          </span>
        </>
      ) : (
        words
      )}
    </span>
  )
}

function usePicked(source: RefObject<HTMLParagraphElement | null>) {
  const [picked, setPicked] = useState<PageToken | null>(null)
  const start = picked?.start
  const close = useCallback(() => {
    setPicked(null)
    source.current?.querySelector<HTMLElement>(`[data-start="${start}"]`)?.focus()
  }, [source, start])
  useEffect(() => {
    if (start === undefined) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('[role="menu"]')) close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [start, close])
  return [picked, setPicked, close] as const
}

type PickWord = (token: PageToken, word: HTMLElement) => void

type LineProps = {
  settings: Settings
  services: SourceServices
  open?(page: PanelPage): void
  onPopup?(open: boolean, dismiss: () => void): void
  glosses?: GlossCache
  pick?: PickWord
}

function useReportPopup(
  popupOpen: boolean,
  onPopup: LineProps['onPopup'],
  setPicked: (picked: null) => void
) {
  useEffect(() => {
    if (!popupOpen || !onPopup) return
    onPopup(true, () => setPicked(null))
    return () => onPopup(false, () => setPicked(null))
  }, [popupOpen, onPopup, setPicked])
}

function Linked({
  found,
  settings,
  services,
  open,
  onPopup,
  glosses: shared,
  pick
}: LineProps & { found: Found }) {
  const glosses = useGlosses(found, settings['readingAids.wordMeanings'], services, shared)
  const source = useRef<HTMLParagraphElement>(null)
  const [picked, setPicked, close] = usePicked(source)
  useReportPopup(picked !== null, onPopup, setPicked)
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
            pick={pick ?? setPicked}
          />
        ))}
      </p>
      <RomajiLine romaji={found.romaji} className="text-sm" />
      {picked ? (
        <section className="pt-2">
          <WordPopup
            key={picked.start}
            text={picked.text}
            ids={picked.ids}
            lookUp={lookUp}
            frequency={frequency}
            romaji={settings['readingAids.romaji']}
            openFullEntry={page => open?.(page)}
            close={close}
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

export function SourceWords({
  source,
  services,
  open
}: {
  source: string
  services: SourceServices
  open?(page: PanelPage): void
}) {
  const settings = useSettings()
  return <SourceLine source={source} settings={settings} services={services} open={open} />
}
