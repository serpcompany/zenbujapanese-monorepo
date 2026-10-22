import { ask, bench } from './bench'

const out = document.getElementById('out')!
const word = document.getElementById('word') as HTMLInputElement

document.getElementById('look')!.addEventListener('click', async () => {
  const answer = await ask('lookup', word.value)
  const first = answer.first
  out.textContent = first ? `${first.headword}【${first.reading}】 ${first.summary} (${answer.ms.toFixed(1)} ms)` : 'No entry'
})

Object.assign(globalThis, {
  spike: {
    ask,
    bench: async () => ({ surface: 'side-panel', bench: await bench() }),
    setUp: () => chrome.runtime.sendMessage({ target: 'background', type: 'setUp' }),
    session: () => chrome.storage.session.get(null),
    local: (values: Record<string, unknown>) => chrome.storage.local.set(values),
    ensure: () => chrome.runtime.sendMessage({ target: 'background', type: 'ensure' })
  }
})
