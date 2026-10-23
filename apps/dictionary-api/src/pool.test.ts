import { EventEmitter } from 'node:events'
import { dictionaryContract } from '@zenbu/dictionary-core/artifact/contract'
import { describe, expect, test, vi } from 'vitest'
import { createApp } from './app'
import { info } from './conformance/fake-service'
import { createPool, type Pool, type WorkerPort } from './pool'
import type { Call, Ready } from './worker'

const wildcardExamplesMs = 3_600
const kanjiDetailsMs = 5

class FakeWorker extends EventEmitter implements WorkerPort {
  readonly received: Call[] = []
  private readonly held: Call[] = []
  private holding = false

  constructor(private readonly workMs: number) {
    super()
    queueMicrotask(() => this.emit('message', { ready: true, info } satisfies Ready))
  }

  postMessage(call: Call) {
    this.received.push(call)
    if (this.holding) this.held.push(call)
    else this.answer(call)
  }

  hold() {
    this.holding = true
  }

  release() {
    this.holding = false
    for (const call of this.held.splice(0)) this.answer(call)
  }

  async terminate() {
    return 0
  }

  private answer(call: Call) {
    queueMicrotask(() =>
      this.emit('message', { id: call.id, result: call.method, ms: this.workMs })
    )
  }
}

async function fakePool(size: number, workMs: number) {
  const workers: FakeWorker[] = []
  const pool = createPool(() => {
    const worker = new FakeWorker(workMs)
    workers.push(worker)
    return worker
  }, size)
  await pool.ready
  return { pool, workers }
}

const methodsOn = (worker: FakeWorker) => worker.received.map(call => [call.method, call.args])

describe('a request for what a thread computed before', () => {
  test.each<[string, (pool: Pool) => Promise<unknown>, (pool: Pool) => Promise<unknown>]>([
    [
      'a search, then its examples',
      pool => pool.search('t*'),
      pool => pool.searchExamples('t*', 25)
    ],
    [
      'a query, then the same query as typed',
      pool => pool.searchExamples('t*', 0),
      pool => pool.searchExamples('T*', 0)
    ],
    [
      'a word, then its examples',
      pool => pool.word(1358280),
      pool => pool.wordExamples(1358280, 25)
    ],
    [
      "a form's examples, then more of them",
      pool => pool.formExamples('食べた', 0, 25),
      pool => pool.formExamples('食べた', 25, 25)
    ],
    ['a kanji, then the same kanji', pool => pool.kanji('要'), pool => pool.kanji('要')]
  ])('waits for that thread when computing it was slow: %s', async (_, first, then) => {
    const { pool, workers } = await fakePool(2, wildcardExamplesMs)
    await first(pool)
    const [answered, other] = workers
    answered.hold()
    const busy = pool.search('い')
    const repeated = then(pool)
    answered.release()
    await Promise.all([busy, repeated])
    expect(answered.received).toHaveLength(3)
    expect(other.received).toEqual([])
  })

  test('waits for that thread while it is still computing it', async () => {
    const { pool, workers } = await fakePool(2, kanjiDetailsMs)
    const [computing, other] = workers
    computing.hold()
    const first = pool.searchExamples('t*', 0)
    const next = pool.searchExamples('t*', 25)
    computing.release()
    await Promise.all([first, next])
    expect(methodsOn(computing)).toEqual([
      ['searchExamples', ['t*', 0]],
      ['searchExamples', ['t*', 25]]
    ])
    expect(other.received).toEqual([])
  })

  test('goes to an idle thread when computing it was quick and its thread is busy', async () => {
    const { pool, workers } = await fakePool(2, kanjiDetailsMs)
    await pool.kanji('要')
    const [answered, other] = workers
    answered.hold()
    const busy = pool.search('い')
    await pool.kanji('要')
    answered.release()
    await busy
    expect(methodsOn(answered)).toEqual([
      ['kanji', ['要']],
      ['search', ['い']]
    ])
    expect(methodsOn(other)).toEqual([['kanji', ['要']]])
  })

  test('goes back to its thread when that thread is as free as any, however quick it was', async () => {
    const { pool, workers } = await fakePool(2, kanjiDetailsMs)
    const [first, second] = workers
    first.hold()
    const busy = pool.search('い')
    await pool.kanji('要')
    first.release()
    await busy
    await pool.kanji('要')
    expect(methodsOn(first)).toEqual([['search', ['い']]])
    expect(methodsOn(second)).toEqual([
      ['kanji', ['要']],
      ['kanji', ['要']]
    ])
  })
})

describe('any other call', () => {
  test('goes to the least busy thread', async () => {
    const { pool, workers } = await fakePool(2, wildcardExamplesMs)
    const [first, second] = workers
    first.hold()
    const busy = pool.searchExamples('t*', 0)
    await pool.searchExamples('eat', 0)
    await pool.word(1358280)
    await pool.browseSummary()
    first.release()
    await busy
    expect(methodsOn(first)).toEqual([['searchExamples', ['t*', 0]]])
    expect(methodsOn(second)).toEqual([
      ['searchExamples', ['eat', 0]],
      ['word', [1358280]],
      ['browseSummary', []]
    ])
  })
})

describe('the build the pool names', () => {
  test('is the one its threads said they loaded, read without a call to one', async () => {
    const { pool, workers } = await fakePool(2, kanjiDetailsMs)
    expect(await pool.info()).toEqual(info)
    expect(workers.flatMap(worker => worker.received)).toEqual([])
  })

  test("costs /healthz and a /v1 answer's headers no call to a thread", async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const { pool, workers } = await fakePool(1, kanjiDetailsMs)
    const token = 'test-token-0123456789'
    const app = createApp({ service: pool, token, ready: () => pool.readyCount() === 1 })
    const health = await app.request('/healthz')
    expect(await health.json()).toEqual({
      status: 'ok',
      build: info.build,
      contract: dictionaryContract,
      features: info.features
    })
    const answer = await app.request('/v1/search/eat', {
      headers: { authorization: `Bearer ${token}` }
    })
    expect(answer.status).toBe(200)
    expect(answer.headers.get('x-dictionary-build')).toBe(info.build)
    expect(answer.headers.get('x-dictionary-contract')).toBe(String(dictionaryContract))
    expect(methodsOn(workers[0])).toEqual([['search', ['eat']]])
  })
})
