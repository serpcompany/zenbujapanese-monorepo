const key = Symbol.for('zenbujapanese.word-popup')

type Scope = { [key]?: EventTarget }

export function wordPopupEvents(scope: Scope = globalThis as Scope): EventTarget {
  scope[key] ??= new EventTarget()
  return scope[key]
}
