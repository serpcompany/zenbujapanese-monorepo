import { afterEach, describe, expect, it } from 'vitest'
import type { DataState } from '../shared/data-state'
import {
  contentOf,
  LanguageDataServer,
  MemoryPool,
  MemoryStorage,
  releaseFiles
} from '../test/fake-language-data'
import { databaseName, type Installed, installedPath, installer, keptPath } from './installer'
import { artifactFile, sha256Hex } from './release'

const laterFiles = ['KanjiStrokeData.sqlite3', 'RankedLists.sqlite3']
const firstFiles = releaseFiles.filter(name => !laterFiles.includes(name))

function extension(
  server: LanguageDataServer,
  storage = new MemoryStorage(),
  pool = new MemoryPool()
) {
  const opened: Installed[] = []
  const states: DataState[] = []
  const writes: string[] = []
  const write = storage.write.bind(storage)
  storage.write = async (path, bytes) => {
    writes.push(path)
    return write(path, bytes)
  }
  const languageData = installer({
    fetch: async (url, init) => {
      states.push(languageData.state())
      return server.fetch(url, init)
    },
    storage,
    pool: async () => pool,
    open: async installed => {
      opened.push(installed)
    },
    now: () => clock
  })
  return { languageData, storage, pool, opened, states, writes }
}

const sha256Of = (name: string, release: string) => sha256Hex(contentOf(name, release))

const checkedAt = 1_761_600_000_000
let clock = checkedAt

afterEach(() => {
  clock = checkedAt
})

const ready = (release: string): DataState => ({
  state: 'ready',
  release,
  bytes: releaseFiles.reduce((sum, name) => sum + contentOf(name, release).byteLength, 0),
  checkedAt
})

async function published(...releases: Parameters<LanguageDataServer['publish']>[0][]) {
  const server = new LanguageDataServer()
  for (const release of releases) await server.publish(release)
  return server
}

describe('installing the language data', () => {
  it('downloads the first set, opens it, writes installed.json last, then adds the later files', async () => {
    const server = await published({ release: '2026.10.1' })
    const { languageData, opened, writes, pool, storage } = extension(server)
    await languageData.start()

    expect(languageData.state()).toEqual(ready('2026.10.1'))
    expect(Object.keys(opened[0].files).sort()).toEqual([...firstFiles].sort())
    expect(Object.keys(opened[1].files).sort()).toEqual([...releaseFiles].sort())
    expect(writes.filter(path => !path.startsWith('staging/'))).toEqual([
      installedPath,
      installedPath,
      installedPath
    ])
    const artifact = await sha256Of(artifactFile, '2026.10.1')
    expect(pool.databases.get(databaseName(artifact))).toEqual(contentOf(artifactFile, '2026.10.1'))
    const kanji = await sha256Of('KanjiReferenceData.json', '2026.10.1')
    expect(await storage.read(keptPath('KanjiReferenceData.json', kanji))).toEqual(
      contentOf('KanjiReferenceData.json', '2026.10.1')
    )
    expect([...storage.files.keys()].filter(path => path.startsWith('staging/'))).toEqual([])
  })

  it('reports bytes done of the first set’s total while downloading', async () => {
    const server = await published({ release: '2026.10.1' })
    const { languageData, states } = extension(server)
    await languageData.start()
    const total = firstFiles.reduce((sum, name) => sum + contentOf(name, '2026.10.1').byteLength, 0)
    const downloading = states.filter(state => state.state === 'downloading')
    expect(downloading[0]).toEqual({ state: 'downloading', done: 0, total })
    const done = downloading.map(state => (state.state === 'downloading' ? state.done : -1))
    expect(done).toEqual([...done].sort((a, b) => a - b))
    expect(done.at(-1)).toBeGreaterThan(0)
  })

  it('downloads the Kuromoji files as published, since they have no parts', async () => {
    const server = await published({ release: '2026.10.1' })
    await extension(server).languageData.start()
    const base = await sha256Of('Kuromoji/base.dat.gz', '2026.10.1')
    expect(server.asked).toContain(`files/${base}/Kuromoji/base.dat.gz`)
    expect(server.asked.filter(key => key.endsWith('.dat.gz.part1.gz'))).toEqual([])
  })

  it('resumes a cut download from its last whole part, after the worker starts again', async () => {
    const server = await published({ release: '2026.10.1' })
    const parts = server.asked
    server.failAfter = 6
    const storage = new MemoryStorage()
    const cut = extension(server, storage)
    await cut.languageData.start()
    expect(cut.languageData.state()).toEqual({ state: 'failed', reason: 'Failed to fetch' })
    const fetchedParts = parts.filter(key => key.endsWith('.gz') && key.includes(artifactFile))
    expect(fetchedParts.length).toBeGreaterThan(0)

    server.failAfter = null
    const asked = parts.length
    const resumed = extension(server, storage)
    await resumed.languageData.start()
    expect(resumed.languageData.state()).toEqual(ready('2026.10.1'))
    expect(parts.slice(asked)).not.toContain(fetchedParts[0])
    const artifact = await sha256Of(artifactFile, '2026.10.1')
    expect(resumed.pool.databases.get(databaseName(artifact))).toEqual(
      contentOf(artifactFile, '2026.10.1')
    )
  })

  it('fails with its reason when a part is not the SHA-256 compressed.json pins', async () => {
    const server = await published({ release: '2026.10.1', partSha256: '0'.repeat(64) })
    const { languageData } = extension(server)
    await languageData.start()
    expect(languageData.state()).toMatchObject({
      state: 'failed',
      reason: expect.stringMatching(
        new RegExp(`^${artifactFile} part 1 is [0-9a-f]{64}, but compressed.json pins 0{64}$`)
      )
    })
  })

  it('fails with its reason when the manifest is not the SHA-256 releases.json pins', async () => {
    const server = await published({ release: '2026.10.1', manifestSha256: 'f'.repeat(64) })
    const { languageData } = extension(server)
    await languageData.start()
    expect(languageData.state()).toMatchObject({
      state: 'failed',
      reason: expect.stringMatching(
        /^releases\/2026\.10\.1\/manifest\.json is [0-9a-f]{64}, but releases\.json pins f{64}$/
      )
    })
  })

  it('picks the newest release whose files it reads', async () => {
    const server = await published(
      { release: '2026.10.1' },
      { release: '2026.10.2', schema: { [artifactFile]: 'zenbu.language-reference.v3' } }
    )
    const { languageData } = extension(server)
    await languageData.start()
    expect(languageData.state()).toEqual(ready('2026.10.1'))
  })

  it('opens what is installed when it starts again, without downloading', async () => {
    const server = await published({ release: '2026.10.1' })
    const first = extension(server)
    await first.languageData.start()
    const asked = server.asked.length
    const again = extension(server, first.storage)
    await again.languageData.start()
    expect(again.languageData.state()).toEqual(ready('2026.10.1'))
    expect(server.asked.length).toBe(asked)
    expect(again.opened).toHaveLength(1)
  })

  it('fails with its reason when installed.json is unreadable, then installs again on update', async () => {
    const server = await published({ release: '2026.10.1' })
    const storage = new MemoryStorage()
    await storage.write(installedPath, new TextEncoder().encode('{'))
    const { languageData } = extension(server, storage)
    await languageData.start()
    expect(languageData.state()).toMatchObject({ state: 'failed' })
    await languageData.update()
    expect(languageData.state()).toEqual(ready('2026.10.1'))
  })
})

describe('updating the language data', () => {
  it('downloads only changed files, answers from the old set until the swap, then deletes the old files', async () => {
    const server = await published({ release: '2026.10.1' })
    const first = extension(server)
    await first.languageData.start()
    await server.publish({ release: '2026.10.2', changed: ['JLPTLevelPack.sqlite3'] })
    const asked = server.asked.length

    const again = extension(server, first.storage, first.pool)
    await again.languageData.start()
    await again.languageData.update()

    const downloaded = server.asked
      .slice(asked)
      .filter(key => key.startsWith('files/'))
      .map(key => key.split('/').slice(2).join('/'))
    expect(new Set(downloaded.map(name => name.replace(/\.part\d+\.gz$/, '')))).toEqual(
      new Set(['JLPTLevelPack.sqlite3'])
    )
    expect(again.states.filter(state => state.state === 'updating')[0]).toMatchObject({
      state: 'updating',
      release: '2026.10.1'
    })
    expect(again.opened.map(installed => installed.release)).toEqual(['2026.10.1', '2026.10.2'])
    expect(again.languageData.state()).toEqual(ready('2026.10.2'))
    const old = await sha256Of('JLPTLevelPack.sqlite3', '2026.10.1')
    const updated = await sha256Of('JLPTLevelPack.sqlite3', '2026.10.2')
    expect(again.pool.databases.has(databaseName(old))).toBe(false)
    expect(again.pool.databases.has(databaseName(updated))).toBe(true)
  })

  it('shows a check for updates at once, and records when it checked', async () => {
    const server = await published({ release: '2026.10.1' })
    const { languageData } = extension(server)
    await languageData.start()
    clock = checkedAt + 86_400_000
    const checking = languageData.update()
    expect(languageData.state()).toEqual({
      ...ready('2026.10.1'),
      state: 'updating',
      done: 0,
      total: 0
    })
    await checking
    expect(languageData.state()).toEqual({ ...ready('2026.10.1'), checkedAt: clock })
  })

  it('keeps answering from the installed set when an update fails, and says why', async () => {
    const server = await published({ release: '2026.10.1' })
    const { languageData } = extension(server)
    await languageData.start()
    server.failAfter = server.asked.length
    await languageData.update()
    expect(languageData.state()).toEqual({ ...ready('2026.10.1'), updateFailed: 'Failed to fetch' })
  })
})
