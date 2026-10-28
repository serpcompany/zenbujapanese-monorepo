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
import { artifactFile, sha256Hex } from './release-files'

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

function downloadBytes(server: LanguageDataServer, release: string, names: readonly string[]) {
  const json = (key: string) => JSON.parse(new TextDecoder().decode(server.objects.get(key)))
  const listed: { name: string; bytes: number }[] = json(`releases/${release}/manifest.json`).files
  const packed = new Map<string, number>(
    json(`releases/${release}/compressed.json`).files.map(
      (file: { name: string; parts: { bytes: number }[] }) => [
        file.name,
        file.parts.reduce((sum, part) => sum + part.bytes, 0)
      ]
    )
  )
  return listed
    .filter(file => names.includes(file.name))
    .reduce((sum, file) => sum + (packed.get(file.name) ?? file.bytes), 0)
}

const fileKeys = (asked: readonly string[]) => asked.filter(key => key.startsWith('files/'))

const partOf = (name: string, part: number) => (key: string) =>
  key.endsWith(`/${name}.part${part}.gz`)

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
      'installed.next.json',
      'installed.next.json',
      'installed.next.json'
    ])
    expect(storage.files.has(installedPath)).toBe(true)
    expect(storage.files.has('installed.next.json')).toBe(false)
    const artifact = await sha256Of(artifactFile, '2026.10.1')
    expect(pool.databases.get(databaseName(artifact))).toEqual(contentOf(artifactFile, '2026.10.1'))
    const kanji = await sha256Of('KanjiReferenceData.json', '2026.10.1')
    expect(await storage.read(keptPath('KanjiReferenceData.json', kanji))).toEqual(
      contentOf('KanjiReferenceData.json', '2026.10.1')
    )
    expect([...storage.files.keys()].filter(path => path.startsWith('staging/'))).toEqual([])
  })

  it('reports the gzipped bytes done of the first set’s download while downloading', async () => {
    const server = await published({ release: '2026.10.1' })
    const { languageData, states } = extension(server)
    await languageData.start()
    const total = downloadBytes(server, '2026.10.1', firstFiles)
    const unpacked = firstFiles.reduce(
      (sum, name) => sum + contentOf(name, '2026.10.1').byteLength,
      0
    )
    expect(total).not.toBe(unpacked)
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

  it('keeps the files it finished when a first install is cut inside a later file', async () => {
    const server = await published({ release: '2026.10.1' })
    server.failOn = partOf('KanjiElementReferenceData.json', 2)
    const storage = new MemoryStorage()
    const cut = extension(server, storage)
    await cut.languageData.start()
    expect(cut.languageData.state()).toEqual({ state: 'failed', reason: 'Failed to fetch' })
    const fetched = fileKeys(server.asked)
    expect(fetched.some(key => key.includes(artifactFile))).toBe(true)

    server.failOn = null
    const asked = server.asked.length
    const resumed = extension(server, storage, cut.pool)
    await resumed.languageData.start()
    expect(resumed.languageData.state()).toEqual(ready('2026.10.1'))
    const again = fileKeys(server.asked.slice(asked))
    expect(again.filter(key => fetched.includes(key))).toEqual([])
    expect(again.some(partOf('KanjiElementReferenceData.json', 2))).toBe(true)
    const artifact = await sha256Of(artifactFile, '2026.10.1')
    expect(resumed.pool.databases.get(databaseName(artifact))).toEqual(
      contentOf(artifactFile, '2026.10.1')
    )
  })

  it('takes the newest release with gzipped copies, and never downloads a whole file that has them', async () => {
    const server = await published({ release: '2026.10.1' }, { release: '2026.10.2' })
    server.objects.delete('releases/2026.10.2/compressed.json')
    const { languageData } = extension(server)
    await languageData.start()
    expect(languageData.state()).toEqual(ready('2026.10.1'))
    const whole = fileKeys(server.asked).filter(key => /\.(sqlite3|json)$/.test(key))
    expect(whole).toEqual([])
  })

  it('fails, to try again later, when no listed release has gzipped copies yet', async () => {
    const server = await published({ release: '2026.10.1' })
    server.objects.delete('releases/2026.10.1/compressed.json')
    const { languageData } = extension(server)
    await languageData.start()
    expect(languageData.state()).toEqual({
      state: 'failed',
      reason: 'No published release has its gzipped copies yet. Zenbu tries again later.'
    })
    expect(fileKeys(server.asked)).toEqual([])
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

  it('opens the set a swap recorded when it stopped before installed.json was moved back', async () => {
    const server = await published({ release: '2026.10.1' })
    const first = extension(server)
    await first.languageData.start()
    await first.storage.move(installedPath, 'installed.next.json')
    const asked = server.asked.length
    const again = extension(server, first.storage, first.pool)
    await again.languageData.start()
    expect(again.languageData.state()).toEqual(ready('2026.10.1'))
    expect(server.asked.length).toBe(asked)
  })

  it('keeps the installed databases, and names it does not know, however the pool reports names', async () => {
    const server = await published({ release: '2026.10.1' })
    const first = extension(server)
    await first.languageData.start()
    const pool = first.pool
    const installed = [...pool.databases.keys()]
    const unknown = ['notes.sqlite3', '/journal']
    const unlinked: string[] = []
    pool.getFileNames = () => [...installed.map(name => name.slice(1)), ...unknown]
    pool.unlink = name => {
      unlinked.push(name)
      return pool.databases.delete(name.startsWith('/') ? name : `/${name}`)
    }
    const again = extension(server, first.storage, pool)
    await again.languageData.start()
    expect(again.languageData.state()).toEqual(ready('2026.10.1'))
    expect(unlinked).toEqual([])
    expect([...pool.databases.keys()]).toEqual(installed)
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

  it('deletes a cut update’s files before the next, so the pool never runs out of room', async () => {
    const server = await published({ release: '2026.10.1' })
    const first = extension(server, new MemoryStorage(), new MemoryPool(16))
    await first.languageData.start()
    await server.publish({ release: '2026.10.2' })
    server.failOn = partOf('KanjiElementReferenceData.json', 2)
    await first.languageData.update()
    expect(first.languageData.state()).toMatchObject({ release: '2026.10.1', state: 'ready' })
    const databases = releaseFiles.filter(name => name.endsWith('.sqlite3'))
    const firstDatabases = databases.filter(name => firstFiles.includes(name))
    expect(first.pool.databases.size).toBe(databases.length + firstDatabases.length)

    server.failOn = null
    await server.publish({ release: '2026.10.3' })
    const again = extension(server, first.storage, first.pool)
    await again.languageData.start()
    await again.languageData.update()
    expect(again.languageData.state()).toEqual(ready('2026.10.3'))
    const current = await Promise.all(releaseFiles.map(name => sha256Of(name, '2026.10.3')))
    const installed = current.map(databaseName).filter(name => again.pool.databases.has(name))
    expect(installed).toHaveLength(databases.length)
    expect(again.pool.databases.size).toBe(databases.length)
    expect(again.pool.most).toBeLessThanOrEqual(16)
    const kept = [...again.storage.files.keys()].filter(path => !path.startsWith('installed'))
    expect(kept.every(path => current.some(sha256 => path.includes(sha256)))).toBe(true)
  })

  async function strokesUpdate() {
    const server = await published({ release: '2026.10.1' })
    const first = extension(server, new MemoryStorage(), new MemoryPool(16))
    await first.languageData.start()
    await server.publish({ release: '2026.10.2', changed: ['KanjiStrokeData.sqlite3'] })
    const old = databaseName(await sha256Of('KanjiStrokeData.sqlite3', '2026.10.1'))
    const updated = databaseName(await sha256Of('KanjiStrokeData.sqlite3', '2026.10.2'))
    const strokesOpened = () =>
      first.opened.map(installed => installed.files['KanjiStrokeData.sqlite3'])
    return { server, ...first, old, updated, strokesOpened }
  }

  it('keeps the old strokes answering, and in the pool, when the new later file fails', async () => {
    const { server, languageData, pool, old, updated, strokesOpened } = await strokesUpdate()
    server.failOn = partOf('KanjiStrokeData.sqlite3', 1)
    await languageData.update()

    expect(languageData.state()).toMatchObject({
      state: 'ready',
      release: '2026.10.2',
      updateFailed: 'Failed to fetch'
    })
    expect(databaseName(strokesOpened().at(-1) ?? '')).toBe(old)
    expect(pool.databases.get(old)).toEqual(contentOf('KanjiStrokeData.sqlite3', '2026.10.1'))
    expect(pool.databases.has(updated)).toBe(false)
    expect(pool.most).toBeLessThanOrEqual(16)
  })

  it('answers from the new strokes once they install, and only then deletes the old ones', async () => {
    const { languageData, pool, old, updated, strokesOpened } = await strokesUpdate()
    const unlink = pool.unlink.bind(pool)
    const unlinkedBeforeNew: string[] = []
    pool.unlink = name => {
      if (!pool.databases.has(updated)) unlinkedBeforeNew.push(name)
      return unlink(name)
    }
    await languageData.update()

    expect(languageData.state()).toEqual(ready('2026.10.2'))
    expect(strokesOpened().slice(-2).map(databaseName)).toEqual([old, updated])
    expect(unlinkedBeforeNew).not.toContain(old)
    expect(pool.databases.has(old)).toBe(false)
    expect(pool.databases.get(updated)).toEqual(contentOf('KanjiStrokeData.sqlite3', '2026.10.2'))
    expect(pool.most).toBeLessThanOrEqual(16)
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
