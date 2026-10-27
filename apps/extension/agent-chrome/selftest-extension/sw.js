console.log('[selftest] service worker started')

let creating
async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return
  creating ??= chrome.offscreen
    .createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS'],
      justification: 'The self-test proves an offscreen document and its worker answer.'
    })
    .finally(() => {
      creating = undefined
    })
  await creating
}

async function ping(n) {
  await ensureOffscreenDocument()
  return chrome.runtime.sendMessage({ to: 'offscreen', n })
}

async function closeOffscreenDocument() {
  await chrome.offscreen.closeDocument()
  console.log('[selftest] offscreen document closed')
  return 'closed'
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.to === 'offscreen') return false
  if (message.ping) {
    ping(message.ping).then(sendResponse)
    return true
  }
  if (message.closeOffscreen) {
    closeOffscreenDocument().then(sendResponse)
    return true
  }
  console.log('[selftest] service worker got', message.from, 'from', sender.url ?? sender.id)
  sendResponse({ ok: true })
  return false
})
