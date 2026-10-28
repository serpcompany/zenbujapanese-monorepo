import { Worker } from 'node:worker_threads'
import { LruCache } from '@zenbu/dictionary-core/artifact/cache'
import { normalizeQuery } from '@zenbu/dictionary-core/search/query'
import { log } from '@zenbu/node-service/log'
import type { VerifiedFiles } from './load'
import type { DictionaryService, ServiceInfo, ServiceMethod } from './service'
import type { Call, Ready, Reply } from './worker'

export interface WorkerPort {
  postMessage(call: Call): void
  on(event: 'message', listener: (message: Reply | Ready) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  on(event: 'exit', listener: (code: number) => void): unknown
  terminate(): Promise<unknown>
}

type StartWorker = () => WorkerPort

interface PendingCall {
  cacheKey: string | undefined
  resolve(value: unknown): void
  reject(error: Error): void
}

interface Thread {
  worker: WorkerPort
  ready: Promise<void>
  pending: Map<number, PendingCall>
  generation: number
}

interface Answered {
  thread: number
  generation: number
  ms: number | null
}

export interface Pool extends DictionaryService {
  ready: Promise<void>
  readyCount(): number
  close(): Promise<void>
}

const keysRememberedPerThread = 10_000

const worthWaitingForMs = 250

const cachedBy = {
  query: (query: string) => `query ${normalizeQuery(query)}`,
  word: (entSeq: number) => `word ${entSeq}`,
  form: (form: string) => `form ${form}`,
  kanji: (character: string) => `kanji ${character}`
}

function workerUrl(): URL {
  const here = new URL(import.meta.url)
  const runningTypeScriptSource = here.pathname.endsWith('.ts')
  return runningTypeScriptSource ? new URL('./worker-dev.mjs', here) : new URL('./worker.mjs', here)
}

export function workerThreads(files: VerifiedFiles): StartWorker {
  const url = workerUrl()
  return () => new Worker(url, { workerData: files })
}

export function createPool(start: StartWorker, size: number): Pool {
  const threads: Thread[] = []
  const answered = new LruCache<string, Answered>(size * keysRememberedPerThread)
  let nextId = 0
  let closing = false
  let loaded = 0
  let learnInfo: (info: ServiceInfo) => void = () => {}
  const info = new Promise<ServiceInfo>(resolve => {
    learnInfo = resolve
  })

  const current = (cacheKey: string) => {
    const known = answered.get(cacheKey)
    return known && known.generation === threads[known.thread].generation ? known : undefined
  }

  const learnCost = (cacheKey: string, thread: number, ms: number) => {
    const known = current(cacheKey)
    if (known?.thread !== thread) return
    answered.set(cacheKey, { ...known, ms: Math.max(known.ms ?? 0, ms) })
  }

  const forgetFailed = (cacheKey: string, thread: number) => {
    const known = current(cacheKey)
    if (known?.thread === thread && known.ms === null) answered.set(cacheKey, { ...known, ms: 0 })
  }

  const spawn = (index: number, generation: number): Thread => {
    const worker = start()
    const pending: Thread['pending'] = new Map()
    let markReady: () => void = () => {}
    let failReady: (error: Error) => void = () => {}
    const ready = new Promise<void>((resolve, reject) => {
      markReady = resolve
      failReady = reject
    })
    worker.on('message', message => {
      if ('ready' in message) {
        loaded++
        learnInfo(message.info)
        markReady()
        return
      }
      const call = pending.get(message.id)
      if (!call) return
      pending.delete(message.id)
      if ('error' in message) {
        if (call.cacheKey !== undefined) forgetFailed(call.cacheKey, index)
        call.reject(new Error(message.error))
        return
      }
      if (call.cacheKey !== undefined) learnCost(call.cacheKey, index, message.ms)
      call.resolve(message.result)
    })
    worker.on('error', error => {
      log('error', 'worker failed', { index, error: error.message })
      failReady(error)
    })
    worker.on('exit', code => {
      for (const call of pending.values())
        call.reject(new Error(`Worker ${index} exited (${code})`))
      pending.clear()
      if (closing) return
      loaded = Math.max(0, loaded - 1)
      log('warn', 'worker exited; starting another', { index, code })
      threads[index] = spawn(index, generation + 1)
    })
    return { worker, ready, pending, generation }
  }

  for (let index = 0; index < size; index++) threads.push(spawn(index, 0))

  const leastBusy = () => {
    let chosen = 0
    for (let index = 1; index < threads.length; index++) {
      if (threads[index].pending.size < threads[chosen].pending.size) chosen = index
    }
    return chosen
  }

  const worthGoingBack = (known: Answered, least: number) =>
    threads[known.thread].pending.size <= threads[least].pending.size ||
    known.ms === null ||
    known.ms >= worthWaitingForMs

  const threadFor = (cacheKey: string | undefined) => {
    const least = leastBusy()
    if (cacheKey === undefined) return least
    const known = current(cacheKey)
    if (known && worthGoingBack(known, least)) {
      answered.set(cacheKey, known)
      return known.thread
    }
    answered.set(cacheKey, { thread: least, generation: threads[least].generation, ms: null })
    return least
  }

  const call = (method: ServiceMethod, args: unknown[], cacheKey?: string) => {
    const thread = threads[threadFor(cacheKey)]
    const id = nextId++
    return new Promise<never>((resolve, reject) => {
      thread.pending.set(id, { cacheKey, resolve: resolve as (value: unknown) => void, reject })
      thread.worker.postMessage({ id, method, args } satisfies Call)
    })
  }

  return {
    ready: Promise.all(threads.map(thread => thread.ready)).then(() => undefined),
    readyCount: () => loaded,
    async close() {
      closing = true
      await Promise.all(threads.map(thread => thread.worker.terminate()))
    },
    info: () => info,
    search: (query, pickedKanji = false) =>
      call('search', [query, pickedKanji], cachedBy.query(query)),
    searchExamples: (query, from) => call('searchExamples', [query, from], cachedBy.query(query)),
    word: entSeq => call('word', [entSeq], cachedBy.word(entSeq)),
    wordExamples: (entSeq, from) => call('wordExamples', [entSeq, from], cachedBy.word(entSeq)),
    formExamples: (form, from, limit) =>
      call('formExamples', [form, from, limit], cachedBy.form(form)),
    kanji: character => call('kanji', [character], cachedBy.kanji(character)),
    wordSitemaps: () => call('wordSitemaps', []),
    sitemapWords: (number, after, limit) => call('sitemapWords', [number, after, limit]),
    retired: () => call('retired', []),
    pages: asked => call('pages', [asked]),
    browseSummary: () => call('browseSummary', []),
    kanaIndex: script => call('kanaIndex', [script]),
    kanaInitial: (script, initial) => call('kanaInitial', [script, initial]),
    kanaWords: (script, prefix, page) => call('kanaWords', [script, prefix, page]),
    browseCategories: () => call('browseCategories', []),
    categoryWords: (slug, order, page) => call('categoryWords', [slug, order, page]),
    rankedLists: () => call('rankedLists', []),
    rankedWords: (slug, page) => call('rankedWords', [slug, page]),
    kanjiHub: () => call('kanjiHub', []),
    kanjiList: slug => call('kanjiList', [slug]),
    browseSitemap: () => call('browseSitemap', []),
    wordCards: ids => call('wordCards', [ids]),
    segment: text => call('segment', [text]),
    radicals: () => call('radicals', [])
  }
}
