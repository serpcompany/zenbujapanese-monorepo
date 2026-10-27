import type { DataState, InstalledRelease } from '../shared/data-state'
import { donePath, download, downloadBytes } from './download'
import { type Fetch, fileKey, newestRelease, type Release, type ReleaseFile } from './release'
import type { Storage } from './storage'

export interface Installed extends InstalledRelease {
  manifestSha256: string
  files: Record<string, string>
}

export interface DatabasePool {
  importDb(name: string, chunk: () => Uint8Array | undefined): Promise<unknown>
  unlink(name: string): boolean
  getFileNames(): string[]
}

export interface InstallerOptions {
  fetch: Fetch
  storage: Storage
  pool: () => Promise<DatabasePool>
  open(installed: Installed): Promise<void>
  now?: () => number
}

export const installedPath = 'installed.json'

const nextInstalledPath = 'installed.next.json'

const importChunkBytes = 8 << 20

const isDatabase = (name: string) => name.endsWith('.sqlite3')

export const databaseName = (sha256: string) => `/${sha256}.sqlite3`

export const keptPath = (name: string, sha256: string) => fileKey({ name, sha256 })

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))

const bytesOf = (files: readonly ReleaseFile[]) => files.reduce((sum, file) => sum + file.bytes, 0)

const sha256sOf = (release: Release) =>
  [...release.first, ...release.later].map(file => file.sha256)

const shown = ({ release, bytes, checkedAt }: Installed): InstalledRelease => ({
  release,
  bytes,
  checkedAt
})

export function installer(options: InstallerOptions) {
  const { fetch, storage } = options
  const now = options.now ?? Date.now
  let state: DataState = { state: 'checking' }
  let installed: Installed | null = null

  async function importDatabase(file: ReleaseFile, path: string) {
    const access = await storage.access(path)
    try {
      const size = access.size()
      let at = 0
      await (await options.pool()).importDb(databaseName(file.sha256), () => {
        if (at >= size) return undefined
        const chunk = new Uint8Array(Math.min(importChunkBytes, size - at))
        at += access.read(chunk, at)
        return chunk
      })
    } finally {
      access.close()
    }
    await storage.remove(path)
  }

  async function fetchFiles(files: readonly ReleaseFile[], report: (done: number) => void) {
    let done = 0
    const count = (bytes: number) => {
      done += bytes
      report(done)
    }
    for (const file of files) {
      if (await storage.read(donePath(file))) {
        count(downloadBytes(file))
        continue
      }
      const path = await download(fetch, storage, file, count)
      if (isDatabase(file.name)) await importDatabase(file, path)
      else await storage.move(path, keptPath(file.name, file.sha256))
      await storage.write(donePath(file), new Uint8Array())
    }
  }

  async function sweep(kept: ReadonlySet<string>) {
    const pool = await options.pool()
    for (const name of pool.getFileNames()) {
      if (!kept.has(name.slice(1, -'.sqlite3'.length))) pool.unlink(name)
    }
    for (const sha256 of await storage.list('files')) {
      if (!kept.has(sha256)) await storage.remove(`files/${sha256}`)
    }
    for (const name of await storage.list('staging')) {
      if (!kept.has(name.split('.')[0])) await storage.remove(`staging/${name}`)
    }
  }

  const keptFor = (...sha256s: string[][]) =>
    new Set([...Object.values(installed?.files ?? {}), ...sha256s.flat()])

  async function record(next: Installed) {
    await storage.write(nextInstalledPath, new TextEncoder().encode(JSON.stringify(next)))
    await storage.remove(installedPath)
    await storage.move(nextInstalledPath, installedPath)
    installed = next
  }

  async function swap(next: Installed, release: Release) {
    await options.open(next)
    await record(next)
    await sweep(keptFor(sha256sOf(release)))
  }

  const isInstalled = (file: ReleaseFile) => installed?.files[file.name] === file.sha256

  function progress(total: number) {
    const from = installed
    return (done: number) => {
      state = from
        ? { state: 'updating', ...shown(from), done, total }
        : { state: 'downloading', done, total }
    }
  }

  async function installFirst(release: Release) {
    const changed = release.first.filter(file => !isInstalled(file))
    if (changed.length === 0 && installed?.manifestSha256 === release.manifestSha256) return
    const report = progress(changed.reduce((sum, file) => sum + downloadBytes(file), 0))
    report(0)
    await fetchFiles(changed, report)
    if (!installed) state = { state: 'checking' }
    const files = [...release.first, ...release.later.filter(isInstalled)]
    await swap(
      {
        release: release.release,
        bytes: bytesOf(files),
        checkedAt: installed?.checkedAt ?? null,
        manifestSha256: release.manifestSha256,
        files: Object.fromEntries(files.map(file => [file.name, file.sha256]))
      },
      release
    )
  }

  async function installLater(release: Release) {
    const changed = release.later.filter(file => !isInstalled(file))
    if (changed.length === 0 || !installed) return
    await fetchFiles(changed, () => undefined)
    const files = { ...installed.files }
    for (const file of changed) files[file.name] = file.sha256
    await swap(
      { ...installed, bytes: bytesOf([...release.first, ...release.later]), files },
      release
    )
  }

  function checking() {
    state = installed
      ? { state: 'updating', ...shown(installed), done: 0, total: 0 }
      : { state: 'checking' }
  }

  async function update() {
    try {
      checking()
      const release = await newestRelease(fetch)
      await sweep(keptFor(sha256sOf(release)))
      await installFirst(release)
      if (installed) state = { state: 'ready', ...shown(installed) }
      await installLater(release)
      await storage.remove('staging')
      if (installed) {
        await record({ ...installed, checkedAt: now() })
        state = { state: 'ready', ...shown(installed) }
      }
    } catch (error) {
      state = installed
        ? { state: 'ready', ...shown(installed), updateFailed: reason(error) }
        : { state: 'failed', reason: reason(error) }
    }
  }

  async function start() {
    const saved = (await storage.read(installedPath)) ?? (await storage.read(nextInstalledPath))
    if (saved) installed = JSON.parse(new TextDecoder().decode(saved)) as Installed
    const staged = (await storage.list('staging')).map(name => name.split('.')[0])
    await sweep(keptFor(staged))
    if (!installed) return update()
    try {
      await options.open(installed)
      state = { state: 'ready', ...shown(installed) }
    } catch (error) {
      installed = null
      state = { state: 'failed', reason: reason(error) }
    }
  }

  let started: Promise<void> = Promise.resolve()
  let updating: Promise<void> | null = null

  return {
    state: () => state,
    start(): Promise<void> {
      started = start().catch(error => {
        installed = null
        state = { state: 'failed', reason: reason(error) }
      })
      return started
    },
    update(): Promise<void> {
      if (!updating) checking()
      updating ??= started.then(update).finally(() => {
        updating = null
      })
      return updating
    }
  }
}
