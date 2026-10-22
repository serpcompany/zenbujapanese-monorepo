import { ask, bench } from './bench'

const popup = document.createElement('div')
popup.id = 'zenbu-spike-popup'
popup.style.cssText = 'position:fixed;z-index:2147483647;background:#fff;color:#111;border:1px solid #888;border-radius:8px;padding:8px 12px;font:14px system-ui;display:none;max-width:360px;box-shadow:0 4px 16px rgba(0,0,0,.2)'
document.documentElement.append(popup)

document.addEventListener('click', async event => {
  const range = document.caretRangeFromPoint(event.clientX, event.clientY)
  if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) return
  const text = range.startContainer.textContent ?? ''
  const answer = await ask('popup', { text, offset: range.startOffset })
  const first = answer.found?.first
  popup.textContent = first ? `${first.headword}【${first.reading}】 ${first.summary}` : `No entry for ${answer.token?.text ?? ''}`
  popup.dataset.ms = String(answer.ms)
  popup.style.left = `${event.clientX + 8}px`
  popup.style.top = `${event.clientY + 16}px`
  popup.style.display = 'block'
})

window.addEventListener('zenbu-spike-bench', async () => {
  let result: unknown
  try {
    const text = document.body.innerText
    const s0 = performance.now()
    const segmented = await ask('segment', text)
    const segmentRoundTrip = performance.now() - s0
    result = { surface: 'content-script', bench: await bench(), segment: { ...segmented, roundTrip: segmentRoundTrip, characters: text.length } }
  } catch (error) {
    result = { error: String(error) }
  }
  document.documentElement.dataset.zenbuBench = JSON.stringify(result)
})
document.documentElement.dataset.zenbuContent = 'ready'
