const handOverEvent = 'zenbujapanese-page-lookup'

export type Started = { stop(): void }

export function startUnlessRunning(
  page: EventTarget,
  alive: () => boolean,
  start: () => Started
): Started | null {
  if (!page.dispatchEvent(new Event(handOverEvent, { cancelable: true }))) return null
  const started = start()
  const stop = () => {
    page.removeEventListener(handOverEvent, answer)
    started.stop()
  }
  function answer(event: Event) {
    if (alive()) event.preventDefault()
    else stop()
  }
  page.addEventListener(handOverEvent, answer)
  return { stop }
}
