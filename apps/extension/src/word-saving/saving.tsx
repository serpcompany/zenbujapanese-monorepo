import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import {
  askWord,
  type CopyAnswer,
  type CopyChange,
  changeWord,
  onKnownChanged,
  onSavingRefused,
  type SavingRefusal,
  type SavingRefused,
  type WordView
} from '../shared/account-copy'

export type SavingPort = {
  ask(item: string): Promise<WordView | null>
  change(item: string, change: CopyChange): Promise<CopyAnswer>
  onKnown(listener: (known: Record<string, boolean> | null) => void): () => void
  onRefused(listener: (told: SavingRefused) => void): () => void
  signIn(): void
  page(): string
}

export const chromeSaving: SavingPort = {
  ask: item => askWord(item),
  change: (item, change) => changeWord(item, change),
  onKnown: listener => onKnownChanged(listener),
  onRefused: listener => onSavingRefused(listener),
  signIn: () =>
    void chrome.runtime
      .sendMessage({ target: 'service-worker', openPanel: { tab: 'account' } })
      .catch(() => undefined),
  page: () => location.href
}

export type SavingToast =
  | { kind: SavingRefusal }
  | { kind: 'known'; headword: string; undo(): void }

export const toastShown = 5_000

type Saving = {
  port: SavingPort
  views: Record<string, WordView>
  refresh(item: string): Promise<void>
  toast: SavingToast | null
  show(toast: SavingToast): void
  dismiss(): void
  noteFor: string | null
  focusNote(item: string | null): void
}

const SavingContext = createContext<Saving | null>(null)

function useToast() {
  const [toast, setToast] = useState<SavingToast | null>(null)
  const shown = useRef<SavingToast | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const put = useCallback((next: SavingToast | null) => {
    clearTimeout(timer.current)
    shown.current = next
    setToast(next)
  }, [])
  const dismiss = useCallback(() => put(null), [put])
  const show = useCallback(
    (next: SavingToast) => {
      if (next.kind !== 'known' && shown.current?.kind === next.kind) return
      put(next)
      timer.current = setTimeout(dismiss, toastShown)
    },
    [put, dismiss]
  )
  useEffect(() => () => clearTimeout(timer.current), [])
  return { toast, show, dismiss }
}

export function SavingProvider({ port, children }: { port: SavingPort; children: ReactNode }) {
  const [views, setViews] = useState<Record<string, WordView>>({})
  const [noteFor, focusNote] = useState<string | null>(null)
  const { toast, show, dismiss } = useToast()
  const refresh = useCallback(
    async (item: string) => {
      const view = await port.ask(item)
      if (view) setViews(shown => ({ ...shown, [item]: view }))
    },
    [port]
  )
  useEffect(
    () =>
      port.onRefused(({ refusal, page }) => {
        if (refusal === null) return dismiss()
        if (page === undefined || page === port.page()) show({ kind: refusal })
      }),
    [port, show, dismiss]
  )
  const saving = useMemo(
    () => ({ port, views, refresh, toast, show, dismiss, noteFor, focusNote }),
    [port, views, refresh, toast, show, dismiss, noteFor]
  )
  return <SavingContext value={saving}>{children}</SavingContext>
}

export function useSaving(): Saving {
  const saving = useContext(SavingContext)
  if (!saving) throw new Error('useSaving needs a SavingProvider.')
  return saving
}
