// A pool of worker threads (./worker.ts), each with its own dictionary, answering as one
// `DictionaryService`. Each call goes to the thread with the fewest calls in flight; a thread
// that dies fails its calls and is replaced.

import { Worker } from 'node:worker_threads'
import type { ConjugationSitemapWord } from '@zenbu/dictionary-core/artifact/conjugation-sitemap'
import type { VerifiedFiles } from './load'
import { log } from './log'
import type { DictionaryService, ServiceMethod } from './service'
import type { Call, Reply, SitemapReply } from './worker'

interface Thread {
  worker: Worker
  ready: Promise<void>
  pending: Map<number, { resolve(value: unknown): void; reject(error: Error): void }>
}

/**
 * Works out the conjugations sitemap in a worker thread of its own, which exits when done, so it
 * takes no answering thread; a few minutes of one core after the service starts.
 */
export function computeConjugationSitemap(files: VerifiedFiles): Promise<ConjugationSitemapWord[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl(), {
      workerData: { ...files, task: 'conjugation-sitemap' }
    })
    worker.once('message', (message: SitemapReply) => {
      resolve(message.sitemap)
      void worker.terminate()
    })
    worker.once('error', reject)
    worker.once('exit', code => {
      if (code !== 0) reject(new Error(`The conjugations sitemap worker exited (${code})`))
    })
  })
}

export interface Pool extends DictionaryService {
  /** Resolves once every thread has loaded its dictionary. */
  ready: Promise<void>
  /** How many threads are loaded. */
  readyCount(): number
  close(): Promise<void>
}

/**
 * The worker script: the bundled one beside the server in production; in development, a shim
 * that loads the TypeScript source through tsx.
 */
function workerUrl(): URL {
  const here = new URL(import.meta.url)
  return here.pathname.endsWith('.ts')
    ? new URL('./worker-dev.mjs', here)
    : new URL('./worker.mjs', here)
}

export function createPool(files: VerifiedFiles, size: number): Pool {
  const url = workerUrl()
  const threads: Thread[] = []
  let nextId = 0
  let closing = false
  let loaded = 0

  const spawn = (index: number): Thread => {
    const worker = new Worker(url, { workerData: files })
    const pending: Thread['pending'] = new Map()
    let markReady: () => void = () => {}
    let failReady: (error: Error) => void = () => {}
    const ready = new Promise<void>((resolve, reject) => {
      markReady = resolve
      failReady = reject
    })
    worker.on('message', (message: Reply | { ready: true }) => {
      if ('ready' in message) {
        loaded++
        markReady()
        return
      }
      const call = pending.get(message.id)
      if (!call) return
      pending.delete(message.id)
      if ('error' in message) call.reject(new Error(message.error))
      else call.resolve(message.result)
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
      threads[index] = spawn(index)
    })
    return { worker, ready, pending }
  }

  for (let index = 0; index < size; index++) threads.push(spawn(index))

  const call = (method: ServiceMethod, args: unknown[]) => {
    const thread = threads.reduce((least, candidate) =>
      candidate.pending.size < least.pending.size ? candidate : least
    )
    const id = nextId++
    return new Promise<never>((resolve, reject) => {
      thread.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
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
    info: () => call('info', []),
    search: query => call('search', [query]),
    searchExamples: (query, from) => call('searchExamples', [query, from]),
    word: entSeq => call('word', [entSeq]),
    wordExamples: (entSeq, from) => call('wordExamples', [entSeq, from]),
    conjugationWord: entSeq => call('conjugationWord', [entSeq]),
    formExamples: (form, from, limit) => call('formExamples', [form, from, limit]),
    kanji: character => call('kanji', [character]),
    wordSitemaps: () => call('wordSitemaps', []),
    sitemapWords: (number, after, limit) => call('sitemapWords', [number, after, limit]),
    indexableKanji: () => call('indexableKanji', []),
    retired: () => call('retired', [])
  }
}
