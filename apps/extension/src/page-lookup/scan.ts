import type { Lookup, SegmentAnswer } from '../shared/dictionary'
import { chunks } from './chunks'
import type { Found } from './rendering'
import { type PageToken, pageTokens } from './words'

export type Segment = (text: string) => Lookup<SegmentAnswer>

export type ScanProblem = 'segment-failed' | 'segment-mismatch'

type Read =
  | { type: 'found'; found: Found }
  | { type: 'not-ready' }
  | { type: 'problem'; problem: ScanProblem }

const plain = (text: string, start: number, end: number): PageToken => {
  const part = text.slice(start, end)
  return { start, end, text: part, ids: [], ruby: [{ text: part }] }
}

export function covering(text: string, tokens: readonly PageToken[]): PageToken[] {
  const all: PageToken[] = []
  let at = 0
  for (const token of tokens) {
    if (token.start > at) all.push(plain(text, at, token.start))
    all.push(token)
    at = token.end
  }
  if (at < text.length) all.push(plain(text, at, text.length))
  return all
}

export async function readText(text: string, segment: Segment): Promise<Read> {
  const parts = chunks(text)
  const answers = await Promise.all(parts.map(part => segment(part.text)))
  const tokens: PageToken[] = []
  const said: string[] = []
  for (const [index, answer] of answers.entries()) {
    if (answer.type === 'not-ready') return { type: 'not-ready' }
    if (answer.type !== 'segment') return { type: 'problem', problem: 'segment-failed' }
    const placed = pageTokens(answer.tokens, parts[index].text, parts[index].start)
    if (!placed) return { type: 'problem', problem: 'segment-mismatch' }
    tokens.push(...placed)
    if (answer.romaji) said.push(answer.romaji)
  }
  const romaji = said.length > 0 ? said.join(' ') : null
  return { type: 'found', found: { text, tokens: covering(text, tokens), romaji } }
}

export type Scanner = { add(nodes: readonly Text[]): void; stop(): void }

type Options = {
  segment: Segment
  found(node: Text, found: Found): void
  problem(problem: ScanProblem): void
  wait(milliseconds: number): Promise<void>
  running?: number
}

const firstWait = 2000

const longestWait = 10000

export function scanner({ segment, found, problem, wait, running = 4 }: Options): Scanner {
  const queue: Text[] = []
  const queued = new Set<Text>()
  let busy = 0
  let paused = false
  let stopped = false
  let backoff = firstWait

  const enqueue = (node: Text, front = false) => {
    if (queued.has(node)) return
    queued.add(node)
    if (front) queue.unshift(node)
    else queue.push(node)
  }

  const pause = () => {
    if (paused) return
    paused = true
    const waited = backoff
    backoff = Math.min(backoff * 2, longestWait)
    wait(waited).then(() => {
      paused = false
      pump()
    })
  }

  const settle = (node: Text, text: string, read: Read) => {
    if (read.type === 'not-ready') {
      enqueue(node, true)
      pause()
      return
    }
    backoff = firstWait
    if (read.type === 'problem') problem(read.problem)
    else if (node.isConnected && node.data === text) found(node, read.found)
  }

  function pump() {
    while (!stopped && !paused && busy < running && queue.length > 0) {
      const node = queue.shift() as Text
      queued.delete(node)
      if (!node.isConnected) continue
      const text = node.data
      busy += 1
      readText(text, segment)
        .catch((): Read => ({ type: 'problem', problem: 'segment-failed' }))
        .then(read => {
          busy -= 1
          if (stopped) return
          settle(node, text, read)
          pump()
        })
    }
  }

  return {
    add(nodes) {
      for (const node of nodes) enqueue(node)
      pump()
    },
    stop() {
      stopped = true
      queue.length = 0
      queued.clear()
    }
  }
}
