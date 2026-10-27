import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { control, launchOptions, startChrome, stopChrome, whoHoldsChrome } from './chrome.mjs'
import { connect, readState } from './connect.mjs'
import { logDir } from './paths.mjs'

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    ...launchOptions,
    headful: { type: 'boolean', default: false },
    name: { type: 'string' },
    'skip-build': { type: 'boolean', default: false },
    page: { type: 'string' },
    new: { type: 'boolean', default: false },
    full: { type: 'boolean', default: false },
    timeout: { type: 'string', default: '30000' },
    grep: { type: 'string' },
    raw: { type: 'boolean', default: false }
  }
})
const [command, ...rest] = positionals
const print = value =>
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))

async function withPage(fn) {
  const { browser, page } = await connect()
  try {
    let p
    if (opts.new) p = await browser.newPage()
    else p = await page(opts.page)
    return await fn(p, browser)
  } finally {
    await browser.disconnect()
  }
}

function rawCall(wsUrl, method, params) {
  return new Promise((resolvePromise, reject) => {
    const ws = new WebSocket(wsUrl)
    ws.addEventListener('error', () => reject(new Error(`cannot reach ${wsUrl}`)))
    ws.addEventListener('open', () => ws.send(JSON.stringify({ id: 1, method, params })))
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.id !== 1) return
      ws.close()
      if (message.error) reject(new Error(message.error.message))
      else resolvePromise(message.result)
    })
  })
}

function asFunctionBody(js) {
  return /\breturn\b|;/.test(js) ? `(async () => { ${js} })()` : `(async () => (${js}))()`
}

const commands = {
  async start() {
    print(
      await startChrome({
        headless: opts.headless,
        unmute: opts.unmute,
        persistent: opts.persistent,
        offline: opts.offline,
        net: opts.net,
        pages: opts.pages,
        mapHost: opts['map-host'],
        ext: opts.ext
      })
    )
  },
  async stop() {
    print(await stopChrome())
  },
  async status() {
    const holder = await whoHoldsChrome()
    if (!holder) return print('not running')
    if (holder.other)
      return print({
        otherChrome: holder.other,
        note: 'not this harness: probably the old tmp/agent/agent-chrome one'
      })
    print({ ...holder.harness, ...(await control('/status')) })
  },
  async load() {
    print(await control(`/load?path=${encodeURIComponent(resolve(rest[0]))}`))
  },
  async unload() {
    print(await control(`/unload?id=${encodeURIComponent(rest[0])}`))
  },
  async pages() {
    const { browser } = await connect()
    const pages = await browser.pages()
    print(
      await Promise.all(
        pages.map(async (p, i) => `${i} ${p.url()} | ${await p.title().catch(() => '')}`)
      )
    )
    await browser.disconnect()
  },
  async targets() {
    const { browser } = await connect()
    print(browser.targets().map(t => `${t.type()} ${t.url()}`))
    await browser.disconnect()
  },
  async goto() {
    await withPage(async p => {
      const response = await p.goto(rest[0], {
        waitUntil: 'domcontentloaded',
        timeout: Number(opts.timeout)
      })
      print({ url: p.url(), status: response?.status() ?? null, title: await p.title() })
    })
  },
  async open() {
    const state = readState()
    if (!state) throw new Error('agent Chrome is not running')
    const { webSocketDebuggerUrl } = await (await fetch(`${state.browserURL}/json/version`)).json()
    print(await rawCall(webSocketDebuggerUrl, 'Target.createTarget', { url: rest[0] }))
  },
  async eval() {
    if (opts.raw) {
      const state = readState()
      if (!state) throw new Error('agent Chrome is not running')
      const list = await (await fetch(`${state.browserURL}/json/list`)).json()
      const target = list.filter(t => t.type === 'page' && t.url.includes(opts.page ?? '')).at(-1)
      if (!target) throw new Error('no matching page')
      const result = await rawCall(target.webSocketDebuggerUrl, 'Runtime.evaluate', {
        expression: asFunctionBody(rest.join(' ')),
        returnByValue: true,
        awaitPromise: true
      })
      return print(
        result.exceptionDetails
          ? result.exceptionDetails.exception?.description
          : result.result?.value
      )
    }
    await withPage(async p => print(await p.evaluate(asFunctionBody(rest.join(' ')))))
  },
  async wait() {
    await withPage(async p => {
      const started = Date.now()
      await p.waitForFunction(rest.join(' '), {
        timeout: Number(opts.timeout),
        polling: 250
      })
      print({ waitedMs: Date.now() - started })
    })
  },
  async click() {
    await withPage(async p => {
      const handle = await p.waitForSelector(rest.join(' '), {
        visible: true,
        timeout: Number(opts.timeout)
      })
      await handle.click()
      print('clicked')
    })
  },
  async type() {
    await withPage(async p => {
      await p.keyboard.type(rest.join(' '))
      print('typed')
    })
  },
  async key() {
    await withPage(async p => {
      for (const k of rest) await p.keyboard.press(k)
      print('pressed')
    })
  },
  async shot() {
    await withPage(async p => {
      const path = resolve(rest[0] ?? join(logDir, `shot-${Date.now()}.png`))
      await p.screenshot({ path, fullPage: opts.full })
      print(path)
    })
  },
  async selftest() {
    const { selftest } = await import('./selftest.mjs')
    const { passed, report } = await selftest({ headful: opts.headful, name: opts.name })
    print(report)
    if (!passed) process.exitCode = 1
  },
  async verify() {
    const { verifyExtension } = await import('./verify.mjs')
    const { passed, report } = await verifyExtension({
      name: opts.name,
      skipBuild: opts['skip-build']
    })
    print(report)
    if (!passed) process.exitCode = 1
  },
  async tail() {
    const folder = readState() ? dirname(readState().consoleLog) : logDir
    const file = join(folder, rest[1] === 'net' ? 'net.log' : 'console.log')
    if (!existsSync(file)) return print('no log yet')
    let lines = readFileSync(file, 'utf8').trimEnd().split('\n')
    if (opts.grep) lines = lines.filter(l => new RegExp(opts.grep).test(l))
    print(lines.slice(-Number(rest[0] ?? 40)).join('\n'))
  }
}

const run = commands[command]
if (!run) {
  print(
    'usage: node ctl.mjs start|stop|status|selftest|verify|load <dir>|unload <id>|pages|targets|open <url>|goto <url>|eval [--raw] <js>|wait <js>|click <selector>|type <text>|key <key>|shot [file]|tail [n] [net]'
  )
  process.exit(2)
}
try {
  await run()
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
