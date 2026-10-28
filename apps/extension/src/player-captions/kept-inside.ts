import type { ShadowMount } from '../content/shadow-mount'
import { hasOpenMenu } from '../word-popup/open-menu'

const presses = [
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
  'mousedown',
  'mouseup',
  'pointerdown',
  'pointerup'
]

const keyEvents = ['keydown', 'keyup', 'keypress']

const controlKeys = new Set([' ', 'Enter'])

const menuKeys = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown'
])

const typed = (event: KeyboardEvent) =>
  event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey

export function keptInside({ host, shadowRoot }: Pick<ShadowMount, 'host' | 'shadowRoot'>) {
  const keepPress = (event: Event) => event.stopPropagation()
  const keepKey = (event: Event) => {
    if (!(event instanceof KeyboardEvent) || event.key === 'Escape') return
    if (
      controlKeys.has(event.key) ||
      (hasOpenMenu(shadowRoot) && (menuKeys.has(event.key) || typed(event)))
    )
      event.stopPropagation()
  }
  for (const type of presses) host.addEventListener(type, keepPress)
  for (const type of keyEvents) host.addEventListener(type, keepKey)
}
