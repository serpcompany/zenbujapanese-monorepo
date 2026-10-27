import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import puppeteer from 'puppeteer-core'
import { launchOptions } from './chrome.mjs'
import {
  checkout,
  controlPort,
  devtoolsPort,
  freshProfiles,
  logDir,
  persistentProfile,
  standInSite,
  stateDir,
  statePath
} from './paths.mjs'
import { hostRules, startStandInSite } from './site.mjs'
import { videoEvents } from './video-events.mjs'

const { values } = parseArgs({
  options: {
    ...launchOptions,
    chrome: {
      type: 'string',
      default: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    }
  }
})

const port = devtoolsPort
mkdirSync(logDir, { recursive: true })
mkdirSync(stateDir, { recursive: true })
mkdirSync(freshProfiles, { recursive: true })
const profile = values.persistent ? persistentProfile : mkdtempSync(join(freshProfiles, 'run-'))
mkdirSync(profile, { recursive: true })
const consoleLog = join(logDir, 'console.log')
const netLog = join(logDir, 'net.log')
const netFilter = values.net ? new RegExp(values.net) : null
const write = (file, line) => appendFileSync(file, `${new Date().toISOString()} ${line}\n`)
const mapHosts = values['map-host']
const site = mapHosts.length
  ? await startStandInSite({
      hosts: mapHosts,
      root: standInSite,
      folder: profile,
      log: line => write(consoleLog, `[site] ${line}`)
    })
  : null
const siteArgs = site ? [`--ignore-certificate-errors-spki-list=${site.spki}`] : []

const puppeteerDefaultsToDrop = [
  '--enable-automation',
  '--disable-background-networking',
  '--disable-component-extensions-with-background-pages',
  '--disable-default-apps',
  '--disable-sync',
  '--disable-features=Translate,AcceptCHFrame,MediaRouter,OptimizationHints,WebUIReloadButton,ProcessPerSiteUpToMainFrameThreshold,IsolateSandboxedIframes'
]

const browser = await puppeteer.launch({
  executablePath: values.chrome,
  headless: values.headless,
  pipe: true,
  enableExtensions: true,
  userDataDir: profile,
  defaultViewport: null,
  ignoreDefaultArgs: puppeteerDefaultsToDrop,
  args: [
    '--remote-debugging-pipe',
    `--remote-debugging-port=${port}`,
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,900',
    '--lang=en-US',
    ...hostRules({ mapHosts, port: site?.port, offline: values.offline }),
    ...siteArgs,
    ...(values.unmute ? [] : ['--mute-audio'])
  ]
})

const extensions = new Map()
async function load(path) {
  const abs = resolve(path)
  const id = await browser.installExtension(abs)
  extensions.set(abs, id)
  write(consoleLog, `[harness] loaded extension ${id} from ${abs}`)
  saveState()
  return id
}

function label(target) {
  const url = target.url()
  const type = target.type() === 'service_worker' ? 'sw' : target.type()
  try {
    const u = new URL(url)
    const v = u.searchParams.get('v')
    return `${type} ${u.host}${u.pathname}${v ? `?v=${v}` : ''}`
  } catch {
    return `${type} ${url}`
  }
}

function render(arg) {
  if ('value' in arg) return typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value)
  if (arg.unserializableValue) return arg.unserializableValue
  if (arg.preview?.properties) {
    const body = arg.preview.properties.map(p => `${p.name}: ${p.value}`).join(', ')
    return arg.subtype === 'array' ? `[${body}]` : `{${body}}`
  }
  return arg.description ?? arg.type
}

const watchedTypes = new Set([
  'page',
  'service_worker',
  'background_page',
  'shared_worker',
  'worker',
  'iframe',
  'other'
])
async function logVideoEvents(session, target) {
  try {
    await session.send('Page.enable')
    await session.send('Page.addScriptToEvaluateOnNewDocument', videoEvents)
  } catch (error) {
    write(consoleLog, `[harness] no video events for ${label(target)}: ${error.message}`)
  }
}

const watched = new WeakSet()
async function watch(target) {
  const type = target.type()
  if (watched.has(target) && type === 'page') write(consoleLog, `[harness] opened ${label(target)}`)
  if (!watchedTypes.has(type) || watched.has(target)) return
  if (type === 'other' && !target.url().startsWith('chrome-extension://')) return
  watched.add(target)
  write(consoleLog, `[harness] attached ${label(target)}`)
  let session
  try {
    session = await target.createCDPSession()
  } catch {
    watched.delete(target)
    return
  }
  const worlds = new Map()
  session.on('Runtime.executionContextCreated', ({ context }) => {
    const aux = context.auxData ?? {}
    const isolated = aux.isDefault === false || aux.type === 'isolated'
    worlds.set(context.id, isolated ? `isolated ${context.name || context.origin}` : 'main')
  })
  session.on('Runtime.consoleAPICalled', e => {
    const world =
      worlds.get(e.executionContextId) ?? (type === 'page' || type === 'iframe' ? 'main' : 'worker')
    write(consoleLog, `[${label(target)}] [${world}] ${e.type}: ${e.args.map(render).join(' ')}`)
  })
  session.on('Runtime.exceptionThrown', ({ exceptionDetails: d }) => {
    write(
      consoleLog,
      `[${label(target)}] exception: ${d.exception?.description?.split('\n')[0] ?? d.text} (${d.url ?? ''}:${d.lineNumber})`
    )
  })
  session.on('Log.entryAdded', ({ entry }) => {
    write(
      consoleLog,
      `[${label(target)}] [log ${entry.source}] ${entry.level}: ${entry.text}${entry.url ? ` (${entry.url.slice(0, 200)})` : ''}`
    )
  })
  if (netFilter) {
    const urls = new Map()
    session.on('Network.requestWillBeSent', ({ requestId, request }) => {
      if (netFilter.test(request.url)) urls.set(requestId, request.url)
    })
    session.on('Network.responseReceived', ({ requestId, response, type: resourceType }) => {
      if (!netFilter.test(response.url)) return
      urls.delete(requestId)
      write(
        netLog,
        `[${label(target)}] ${response.status} ${resourceType} ${response.url.slice(0, 600)}`
      )
    })
    session.on(
      'Network.loadingFailed',
      ({ requestId, errorText, blockedReason, type: resourceType }) => {
        const url = urls.get(requestId)
        if (url)
          write(
            netLog,
            `[${label(target)}] failed ${resourceType} ${errorText} ${blockedReason ?? ''} ${url.slice(0, 300)}`
          )
      }
    )
  }
  session.on('Console.messageAdded', ({ message: m }) => {
    write(
      consoleLog,
      `[${label(target)}] [console ${m.source}] ${m.level}: ${m.text}${m.url ? ` (${m.url.slice(0, 160)}:${m.line})` : ''}`
    )
  })
  const isPage = type === 'page' || type === 'iframe'
  const mode = isPage ? values.pages : 'runtime'
  await Promise.all([
    type === 'page' && mode !== 'off' ? logVideoEvents(session, target) : null,
    mode === 'runtime' ? session.send('Runtime.enable') : null,
    mode === 'console' ? session.send('Console.enable').catch(() => {}) : null,
    session.send('Log.enable').catch(() => {}),
    netFilter ? session.send('Network.enable').catch(() => {}) : null
  ]).catch(() => {})
  await session.send('Runtime.runIfWaitingForDebugger').catch(() => {})
}

browser.on('targetcreated', watch)
browser.on('targetchanged', watch)
for (const t of browser.targets()) watch(t)

const startedAt = new Date().toISOString()
function saveState() {
  const state = {
    pid: process.pid,
    chromePid: browser.process()?.pid,
    browserURL: `http://127.0.0.1:${port}`,
    controlURL: `http://127.0.0.1:${controlPort}`,
    checkout,
    profile,
    persistent: values.persistent,
    offline: values.offline,
    mapHosts,
    headless: values.headless,
    consoleLog,
    netLog: netFilter ? netLog : null,
    netFilter: values.net || null,
    pages: values.pages,
    extensions: Object.fromEntries(extensions),
    startedAt
  }
  writeFileSync(statePath, JSON.stringify(state, null, 2))
}

const version = await browser.version()
write(
  consoleLog,
  `[harness] started ${version} headless=${values.headless} profile=${profile} offline=${values.offline} map=${mapHosts.join(',') || 'none'}`
)
for (const path of values.ext)
  await load(path).catch(e => write(consoleLog, `[harness] load failed ${path}: ${e.message}`))
saveState()

let quitting = false
async function quit(code) {
  if (quitting) return
  quitting = true
  write(consoleLog, '[harness] quitting')
  await browser.close().catch(() => {})
  site?.close()
  if (!values.persistent) rmSync(profile, { recursive: true, force: true })
  rmSync(statePath, { force: true })
  process.exit(code)
}

http
  .createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    try {
      const url = new URL(req.url, 'http://127.0.0.1')
      const arg = k => url.searchParams.get(k)
      if (url.pathname === '/status')
        return send(200, { version, extensions: Object.fromEntries(extensions) })
      if (url.pathname === '/load') return send(200, { id: await load(arg('path')) })
      if (url.pathname === '/unload') {
        await browser.uninstallExtension(arg('id'))
        for (const [p, id] of extensions) if (id === arg('id')) extensions.delete(p)
        saveState()
        return send(200, { ok: true })
      }
      if (url.pathname === '/quit') {
        send(200, { ok: true })
        return quit(0)
      }
      send(404, { error: 'unknown route' })
    } catch (error) {
      send(500, { error: error.message })
    }
  })
  .listen(controlPort, '127.0.0.1')

browser.on('disconnected', () => {
  if (quitting) return
  write(consoleLog, '[harness] chrome disconnected')
  quit(1)
})
process.on('SIGTERM', () => quit(0))
process.on('SIGINT', () => quit(0))
console.log(JSON.stringify({ ready: true, version }))
