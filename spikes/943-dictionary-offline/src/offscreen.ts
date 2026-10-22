const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
let next = 1
const waiting = new Map<number, (value: unknown) => void>()
const progress: { received: number; total: number } = { received: 0, total: 0 }
const ready = new Promise<void>(resolve => {
  worker.addEventListener('message', function first(event) {
    if (event.data?.type === 'ready') {
      worker.removeEventListener('message', first)
      resolve()
    }
  })
})

worker.onmessage = event => {
  const data = event.data
  if (data?.type === 'progress') {
    progress.received = data.received
    progress.total = data.total
    return
  }
  const settle = waiting.get(data.id)
  if (settle) {
    waiting.delete(data.id)
    settle(data)
  }
}

async function call(type: string, arg?: unknown) {
  await ready
  const id = next++
  return new Promise(resolve => {
    waiting.set(id, resolve)
    worker.postMessage({ id, type, arg })
  })
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.target !== 'dictionary') return false
  if (message.type === 'progress') {
    respond({ value: progress })
    return false
  }
  call(message.type, message.arg).then(respond)
  return true
})
