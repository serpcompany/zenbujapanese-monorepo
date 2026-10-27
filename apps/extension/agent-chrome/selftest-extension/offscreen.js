console.log('[selftest] offscreen document loaded')
const worker = new Worker('worker.js')

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.to !== 'offscreen') return false
  worker.addEventListener('message', event => sendResponse(event.data), { once: true })
  worker.postMessage(message.n)
  return true
})
