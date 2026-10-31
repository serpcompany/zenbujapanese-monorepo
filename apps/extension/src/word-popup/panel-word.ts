import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'
import { hasOpenLayer } from './open-layer'
import type { PagePopup } from './page-popup'

export type PanelWord = { readonly text: string; readonly ids: readonly string[] }

type Picked<Word> = { word: Word; at: 'asking' | 'page' | 'inline'; id: number }

const keptPresses = new WeakSet<Event>()

export const keepPress = (event: ReactPointerEvent) => void keptPresses.add(event.nativeEvent)

export const fromKeys = (event: ReactMouseEvent) => event.detail === 0

export function usePickedWord<Word extends PanelWord>(
  focusBack: (word: Word) => void,
  pagePopup?: PagePopup
) {
  const [picked, setPicked] = useState<Picked<Word> | null>(null)
  const asked = useRef(0)
  const closeOnPage = useRef<(() => void) | null>(null)
  const drop = useCallback(() => {
    asked.current += 1
    closeOnPage.current?.()
    closeOnPage.current = null
    setPicked(null)
  }, [])
  const pick = useCallback(
    (word: Word, element: HTMLElement, keys: boolean) => {
      const id = ++asked.current
      if (!pagePopup) return setPicked({ word, at: 'inline', id })
      const fromBottom = window.innerHeight - element.getBoundingClientRect().top
      const current = () => asked.current === id
      const onPage = () => current() && setPicked({ word, at: 'page', id })
      setPicked({ word, at: keys ? 'inline' : 'asking', id })
      closeOnPage.current = pagePopup(
        { text: word.text, ids: word.ids, fromBottom, ...(keys && { inPanel: true }) },
        {
          shown: () => keys || onPage(),
          replaced: onPage,
          closed: () => current() && drop(),
          unavailable: () => current() && setPicked({ word, at: 'inline', id })
        }
      )
    },
    [pagePopup, drop]
  )
  useEffect(() => () => closeOnPage.current?.(), [])
  const word = picked?.word
  useEffect(() => {
    if (word === undefined) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || hasOpenLayer(document)) return
      drop()
      focusBack(word)
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
  }, [word, focusBack, drop])
  return { picked, pick, drop }
}
