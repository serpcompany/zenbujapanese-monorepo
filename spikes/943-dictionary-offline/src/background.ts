const base = 'http://localhost:8943'
const release = '2026.10.3'
const installTimes: Record<string, number> = {}
declare const __SPIKE__: { compressed: boolean; stopAfter: number | null }

let creating: Promise<void> | null = null
async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType] })
  if (contexts.length > 0) return
  creating ??= chrome.offscreen
    .createDocument({ url: 'offscreen.html', reasons: ['WORKERS' as chrome.offscreen.Reason], justification: 'Runs the dictionary in a worker' })
    .finally(() => {
      creating = null
    })
  await creating
}

const send = (type: string, arg?: unknown) => chrome.runtime.sendMessage({ target: 'dictionary', type, arg })

async function setUp(reason: string) {
  installTimes.setUpStart = Date.now()
  await ensureOffscreen()
  installTimes.offscreenReady = Date.now()
  const local = (await chrome.storage.local.get(['compressed', 'stopAfter', 'stopAfterUsed'])) as {
    compressed?: boolean
    stopAfter?: number | null
    stopAfterUsed?: boolean
  }
  const compressed = local.compressed ?? __SPIKE__.compressed
  let stopAfter = local.stopAfter ?? undefined
  if (__SPIKE__.stopAfter && !local.stopAfterUsed) {
    stopAfter = __SPIKE__.stopAfter
    await chrome.storage.local.set({ stopAfterUsed: true })
  }
  const status = (await send('status')) as { value: { installed: Record<string, string> } }
  const install = await send('install', { base, release, compressed, stopAfter })
  installTimes.installed = Date.now()
  const opened = await send('open')
  installTimes.opened = Date.now()
  await chrome.storage.session.set({ setUp: { reason, installTimes, install, opened, before: status } })
}

chrome.runtime.onInstalled.addListener(details => {
  installTimes.onInstalled = Date.now()
  setUp(details.reason)
})

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.target !== 'background') return false
  if (message.type === 'ensure') {
    ensureOffscreen().then(() => respond({ value: true }))
    return true
  }
  if (message.type === 'setUp') {
    setUp('again').then(() => respond({ value: true }), error => respond({ error: String(error) }))
    return true
  }
  return false
})

chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true })
