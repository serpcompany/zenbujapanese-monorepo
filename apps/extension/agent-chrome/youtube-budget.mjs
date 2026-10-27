import { ConnectionClosedError, TargetCloseError } from 'puppeteer-core'
import { readJson, writeAtomically } from './files.mjs'
import { youtubeLedgerPath } from './paths.mjs'

const minute = 60_000
const hour = 60 * minute

const youtubeBudget = {
  pageLoadsPerHour: 4,
  pageLoadsPerDay: 10,
  timedtextEvery: 30 * minute,
  pauseAfter429: 6 * hour
}

const youtubeHost = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/

const youtubeUrlPatterns = ['youtube.com', 'youtube-nocookie.com', 'youtu.be'].flatMap(host => [
  { urlPattern: `*://${host}/*` },
  { urlPattern: `*://*.${host}/*` }
])

function isYouTube(url) {
  try {
    return youtubeHost.test(new URL(url).hostname)
  } catch {
    return false
  }
}

export function youtubeRequestKind(url, resourceType) {
  if (!isYouTube(url)) return null
  if (new URL(url).pathname.startsWith('/api/timedtext')) return 'timedtext'
  return resourceType === 'Document' ? 'page' : null
}

export function emptyLedger() {
  return { page: [], timedtext: [], last429: null, lastRefusal: null }
}

const since = (times, now, span) => times.filter(time => now - Date.parse(time) < span)

export function refusal(ledger, kind, now) {
  if (ledger.last429 && now - Date.parse(ledger.last429) < youtubeBudget.pauseAfter429) {
    return `YouTube answered 429 at ${ledger.last429}; no YouTube request for 6 hours after one`
  }
  if (kind === 'timedtext' && since(ledger.timedtext, now, youtubeBudget.timedtextEvery).length) {
    return 'one timedtext request every 30 minutes at most'
  }
  if (kind !== 'page') return null
  if (since(ledger.page, now, hour).length >= youtubeBudget.pageLoadsPerHour) {
    return `${youtubeBudget.pageLoadsPerHour} YouTube page loads in the last hour`
  }
  if (since(ledger.page, now, 24 * hour).length >= youtubeBudget.pageLoadsPerDay) {
    return `${youtubeBudget.pageLoadsPerDay} YouTube page loads in the last day`
  }
  return null
}

export function recorded(ledger, kind, now) {
  const at = new Date(now).toISOString()
  return { ...ledger, [kind]: [...since(ledger[kind], now, 24 * hour), at] }
}

export function readLedger() {
  return { ...emptyLedger(), ...readJson(youtubeLedgerPath) }
}

function saveLedger(ledger) {
  writeAtomically(youtubeLedgerPath, `${JSON.stringify(ledger, null, 2)}\n`)
}

export function decide(url, resourceType, now = Date.now()) {
  const kind = youtubeRequestKind(url, resourceType)
  if (!kind) return null
  const ledger = readLedger()
  const reason = refusal(ledger, kind, now)
  if (reason) {
    saveLedger({ ...ledger, lastRefusal: { at: new Date(now).toISOString(), url, reason } })
    return reason
  }
  saveLedger(recorded(ledger, kind, now))
  return null
}

export function note429(url, now = Date.now()) {
  if (isYouTube(url)) saveLedger({ ...readLedger(), last429: new Date(now).toISOString() })
}

const closed = error => error instanceof TargetCloseError || error instanceof ConnectionClosedError

export function answerPaused(session, log, { requestId, request, resourceType }) {
  const reason = decide(request.url, resourceType)
  if (reason) log(`[budget] refused ${request.url.slice(0, 200)}: ${reason}`)
  const answer = reason
    ? session.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' })
    : session.send('Fetch.continueRequest', { requestId })
  return answer.catch(error => {
    if (!closed(error))
      log(`[budget] could not answer ${request.url.slice(0, 200)}: ${error.message}`)
  })
}

export async function holdToYouTubeBudget(session, log) {
  session.on('Fetch.requestPaused', paused => answerPaused(session, log, paused))
  session.on('Network.responseReceived', ({ response }) => {
    if (response.status === 429) note429(response.url)
  })
  await Promise.all([
    session.send('Fetch.enable', { patterns: youtubeUrlPatterns }),
    session.send('Network.enable')
  ]).catch(() => {})
}
