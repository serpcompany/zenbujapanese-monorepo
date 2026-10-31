const key = Symbol.for('zenbujapanese.word-popup')

const shownKey = Symbol.for('zenbujapanese.shown-word-popup')

export type HandedOver = { returnTo: Element | null }

export type ShownPopup = { current: { handOver(): HandedOver | null } | null }

type Scope = { [key]?: EventTarget; [shownKey]?: ShownPopup }

export function wordPopupEvents(scope: Scope = globalThis as Scope): EventTarget {
  scope[key] ??= new EventTarget()
  return scope[key]
}

export function shownWordPopup(scope: Scope = globalThis as Scope): ShownPopup {
  scope[shownKey] ??= { current: null }
  return scope[shownKey]
}
