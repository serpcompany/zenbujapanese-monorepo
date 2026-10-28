import { type ReactNode, useLayoutEffect, useRef } from 'react'
import { mountInShadowRoot, type ShadowMount } from '../content/shadow-mount'
import { wordPopupEvents } from './popup-events'
import { outOfWindow, popupPlacement } from './position'
import { WordPopup, type WordPopupProps } from './word-popup'

const popupHostAttribute = 'data-zenbu-word-popup'

type PopupTarget = Pick<WordPopupProps, 'text' | 'ids'> & { anchor: () => DOMRect }

export type PopupSettings = Omit<WordPopupProps, 'text' | 'ids' | 'close'>

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
  report?: (error: unknown) => void
}

const highest = '2147483647'

function windowSize(doc: Document, view: Window) {
  const root = doc.documentElement
  return {
    width: Math.min(view.innerWidth, root.clientWidth || view.innerWidth),
    height: Math.min(view.innerHeight, root.clientHeight || view.innerHeight)
  }
}

function Placed({
  anchor,
  doc,
  view,
  held,
  gone,
  children
}: {
  anchor: () => DOMRect
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
      const placed = popupPlacement(anchor(), size, windowSize(doc, view))
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
      if (!outOfWindow(anchor(), windowSize(doc, view))) place()
      else if (!held()) gone()
      else released.observe(root, { childList: true, subtree: true })
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
  }, [anchor, doc, view, held, gone])
  return (
    <div ref={box} style={{ position: 'fixed', left: 0, top: 0, zIndex: highest }}>
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
  report
}: Options): PopupHost {
  let shown: { mount: ShadowMount; returnTo: Element | null } | null = null
  const events = wordPopupEvents()

  const holds = (event: Event) => shown !== null && event.composedPath().includes(shown.mount.host)

  const menuOpen = () => shown?.mount.shadowRoot.querySelector('[role="menu"]') != null

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || menuOpen()) return
    event.stopPropagation()
    close()
  }
  const onPointer = (event: PointerEvent) => {
    if (!holds(event)) close()
  }
  const onFullscreen = () => {
    if (shown) shownIn(doc).append(shown.mount.host)
  }

  function close() {
    if (!shown) return
    const { mount: mounted, returnTo } = shown
    shown = null
    doc.removeEventListener('keydown', onKey, true)
    doc.removeEventListener('pointerdown', onPointer, true)
    doc.removeEventListener('fullscreenchange', onFullscreen)
    mounted.unmount()
    if (returnTo?.isConnected) (returnTo as HTMLElement).focus?.({ preventScroll: true })
    events.dispatchEvent(new Event('close'))
  }

  function open(target: PopupTarget) {
    const wasOpen = shown !== null
    const returnTo = shown ? shown.returnTo : doc.activeElement
    shown?.mount.unmount()
    const mounted = mount(
      <Placed anchor={target.anchor} doc={doc} view={view} held={menuOpen} gone={close}>
        <WordPopup {...settings()} text={target.text} ids={target.ids} close={close} />
      </Placed>,
      { document: doc, report }
    )
    mounted.host.setAttribute(popupHostAttribute, '')
    shownIn(doc).append(mounted.host)
    shown = { mount: mounted, returnTo }
    if (wasOpen) return
    doc.addEventListener('keydown', onKey, true)
    doc.addEventListener('pointerdown', onPointer, true)
    doc.addEventListener('fullscreenchange', onFullscreen)
    events.dispatchEvent(new Event('open'))
  }

  return { open, close, holds }
}
