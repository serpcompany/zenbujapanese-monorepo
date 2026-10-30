import { type ReactNode, useLayoutEffect, useRef } from 'react'
import { mountInShadowRoot, type ShadowMount } from '../content/shadow-mount'
import { hasOpenLayer } from './open-layer'
import { type HandedOver, shownWordPopup, wordPopupEvents } from './popup-events'
import {
  type Edge,
  edgePlacement,
  outOfWindow,
  type Placement,
  popupPlacement,
  type Size
} from './position'
import { WordPopup, type WordPopupProps } from './word-popup'

const popupHostAttribute = 'data-zenbu-word-popup'

type Where = { anchor: () => DOMRect } | { edge: Edge }

export type CardGone = 'closed' | 'replaced'

export type PopupTarget = Pick<WordPopupProps, 'text' | 'ids'> &
  Where & {
    closed?: (how: CardGone) => void
  }

export type PopupSettings = Omit<WordPopupProps, 'text' | 'ids'>

export type PopupHost = {
  open(target: PopupTarget): void
  close(): void
  holds(event: Event): boolean
}

type Options = {
  doc?: Document
  view?: Window
  settings(): PopupSettings
  mount?: typeof mountInShadowRoot
  prepare?: (mounted: ShadowMount) => void
  report?: (error: unknown) => void
}

type Placing = { place(popup: Size, window: Size): Placement; lost(window: Size): boolean }

const placing = (where: Where): Placing =>
  'edge' in where
    ? { place: (popup, window) => edgePlacement(where.edge, popup, window), lost: () => false }
    : {
        place: (popup, window) => popupPlacement(where.anchor(), popup, window),
        lost: window => outOfWindow(where.anchor(), window)
      }

const hostStyle = 'position:fixed;top:0;left:0;z-index:2147483647;'

function windowSize(doc: Document, view: Window) {
  const root = doc.documentElement
  return {
    width: Math.min(view.innerWidth, root.clientWidth || view.innerWidth),
    height: Math.min(view.innerHeight, root.clientHeight || view.innerHeight)
  }
}

function Placed({
  at,
  doc,
  view,
  held,
  gone,
  children
}: {
  at: Placing
  doc: Document
  view: Window
  held: () => boolean
  gone: () => void
  children: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    let frame = 0
    const place = () => {
      frame = 0
      const size = { width: element.offsetWidth, height: element.offsetHeight }
      const placed = at.place(size, windowSize(doc, view))
      element.style.left = `${placed.left}px`
      element.style.top = `${placed.top}px`
      element.dataset.side = placed.side
    }
    const later = () => {
      if (!frame) frame = view.requestAnimationFrame(moved)
    }
    const root = element.getRootNode()
    const released = new MutationObserver(() => {
      if (held()) return
      released.disconnect()
      later()
    })
    function moved() {
      frame = 0
      if (!at.lost(windowSize(doc, view))) place()
      else if (!held()) gone()
      else
        released.observe(root, { childList: true, subtree: true, attributeFilter: ['data-open'] })
    }
    place()
    const resized = new ResizeObserver(place)
    resized.observe(element)
    view.addEventListener('scroll', later, { capture: true, passive: true })
    view.addEventListener('resize', later)
    return () => {
      view.cancelAnimationFrame(frame)
      resized.disconnect()
      released.disconnect()
      view.removeEventListener('scroll', later, { capture: true })
      view.removeEventListener('resize', later)
    }
  }, [at, doc, view, held, gone])
  return (
    <div ref={box} style={{ position: 'fixed', left: 0, top: 0 }}>
      {children}
    </div>
  )
}

const shownIn = (doc: Document) => {
  const full = doc.fullscreenElement
  return full && full.localName !== 'video' ? full : (doc.body ?? doc.documentElement)
}

export function wordPopupHost({
  doc = document,
  view = window,
  settings,
  mount = mountInShadowRoot,
  prepare,
  report
}: Options): PopupHost {
  let shown: {
    mount: ShadowMount
    returnTo: Element | null
    closed?: PopupTarget['closed']
  } | null = null
  const events = wordPopupEvents()
  const page = shownWordPopup()

  const holds = (event: Event) => shown !== null && event.composedPath().includes(shown.mount.host)

  const layerOpen = () => (shown ? hasOpenLayer(shown.mount.shadowRoot) : false)

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || layerOpen()) return
    event.stopPropagation()
    close()
  }
  const onPointer = (event: PointerEvent) => {
    if (!holds(event)) close()
  }
  const onFullscreen = () => {
    if (shown) shownIn(doc).append(shown.mount.host)
  }

  function listen() {
    doc.addEventListener('keydown', onKey, true)
    doc.addEventListener('pointerdown', onPointer, true)
    doc.addEventListener('fullscreenchange', onFullscreen)
  }

  function takeDown(how: CardGone): HandedOver | null {
    if (!shown) return null
    const { mount: mounted, returnTo, closed } = shown
    shown = null
    if (page.current === self) page.current = null
    doc.removeEventListener('keydown', onKey, true)
    doc.removeEventListener('pointerdown', onPointer, true)
    doc.removeEventListener('fullscreenchange', onFullscreen)
    mounted.unmount()
    closed?.(how)
    return { returnTo }
  }

  const self = { handOver: () => takeDown('replaced') }

  function close() {
    const taken = takeDown('closed')
    if (!taken) return
    const { returnTo } = taken
    if (returnTo?.isConnected) (returnTo as HTMLElement).focus?.({ preventScroll: true })
    events.dispatchEvent(new Event('close'))
  }

  function open(target: PopupTarget) {
    const previous = shown
    const handed = previous ? null : (page.current?.handOver() ?? null)
    const returnTo = previous ? previous.returnTo : handed ? handed.returnTo : doc.activeElement
    if (previous) {
      previous.mount.unmount()
      previous.closed?.('replaced')
    }
    const mounted = mount(
      <Placed at={placing(target)} doc={doc} view={view} held={layerOpen} gone={close}>
        <WordPopup {...settings()} text={target.text} ids={target.ids} />
      </Placed>,
      { document: doc, report }
    )
    mounted.host.setAttribute(popupHostAttribute, '')
    mounted.host.setAttribute('style', hostStyle)
    prepare?.(mounted)
    shownIn(doc).append(mounted.host)
    shown = { mount: mounted, returnTo, closed: target.closed }
    page.current = self
    if (previous) return
    listen()
    if (!handed) events.dispatchEvent(new Event('open'))
  }

  return { open, close, holds }
}
