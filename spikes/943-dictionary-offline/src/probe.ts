const log: unknown[] = []
;(globalThis as any).probeLog = log
const worker = new Worker(new URL('./probe-worker.js', import.meta.url), { type: 'module' })
worker.onmessage = event => log.push(event.data)
worker.onerror = event => log.push({ step: 'error', value: event.message })

const cdn = 'https://cdn.zenbujapanese.com/frequency-packs/zenbu.jiten.anime.ja.ordered-v2/ffbd2b21921ec5a12e1899cd1d67e1b6f162ce17779cd9daeff5e79758e80bc1.json.zip'
;(globalThis as any).probeFetch = async () => {
  try {
    const response = await fetch(cdn, { headers: { Range: 'bytes=0-99' }, cache: 'no-store' })
    return { status: response.status, bytes: (await response.arrayBuffer()).byteLength, range: response.headers.get('content-range') }
  } catch (error) {
    return { error: String(error) }
  }
}
;(globalThis as any).probeWorkerFetch = () =>
  new Promise(resolve => {
    worker.addEventListener('message', event => {
      if (event.data?.step === 'fetch') resolve(event.data.value)
    })
    worker.postMessage({ type: 'fetch', url: cdn })
  })
