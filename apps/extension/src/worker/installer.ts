import type { DataState } from '../shared/data-state'
import { download } from './download'
import { type Fetch, fileKey, newestRelease, type Release, type ReleaseFile } from './release'
import type { Storage } from './storage'

export interface Installed {
  release: string
  manifestSha256: string
  files: Record<string, string>
}

export interface DatabasePool {
  importDb(name: string, chunk: () => Uint8Array | undefined): Promise<unknown>
  unlink(name: string): boolean
}

export interface InstallerOptions {
  fetch: Fetch
  storage: Storage
  pool: () => Promise<DatabasePool>
  open(installed: Installed): Promise<void>
}

export const installedPath = 'installed.json'

const importChunkBytes = 8 << 20

const isDatabase = (name: string) => name.endsWith('.sqlite3')

export const databaseName = (sha256: string) => `/${sha256}.sqlite3`

export const keptPath = (name: string, sha256: string) => fileKey({ name, sha256 })

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function installer(options: InstallerOptions) {
  const { fetch, storage } = options
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
    for (const file of files) {
      const path = await download(fetch, storage, file, bytes => {
        done += bytes
        report(done)
      })
      if (isDatabase(file.name)) await importDatabase(file, path)
      else await storage.move(path, keptPath(file.name, file.sha256))
    }
  }

  async function remove(name: string, sha256: string) {
    if (isDatabase(name)) (await options.pool()).unlink(databaseName(sha256))
    else await storage.remove(`files/${sha256}`)
  }

  async function swap(next: Installed) {
    await options.open(next)
    await storage.write(installedPath, new TextEncoder().encode(JSON.stringify(next)))
    const previous = installed
    installed = next
    const kept = new Set(Object.values(next.files))
    for (const [name, sha256] of Object.entries(previous?.files ?? {})) {
      if (!kept.has(sha256)) await remove(name, sha256)
    }
  }

  const isInstalled = (file: ReleaseFile) => installed?.files[file.name] === file.sha256

  function progress(total: number) {
    const from = installed
    return (done: number) => {
      state = from
        ? { state: 'updating', release: from.release, done, total }
        : { state: 'downloading', done, total }
    }
  }

  async function installFirst(release: Release) {
    const changed = release.first.filter(file => !isInstalled(file))
    if (changed.length === 0 && installed?.manifestSha256 === release.manifestSha256) return
    const report = progress(changed.reduce((sum, file) => sum + file.bytes, 0))
    report(0)
    await fetchFiles(changed, report)
    if (!installed) state = { state: 'checking' }
    await swap({
      release: release.release,
      manifestSha256: release.manifestSha256,
      files: Object.fromEntries(
        [...release.first, ...release.later.filter(isInstalled)].map(file => [
          file.name,
          file.sha256
        ])
      )
    })
  }

  async function installLater(release: Release) {
    const changed = release.later.filter(file => !isInstalled(file))
    if (changed.length === 0 || !installed) return
    await fetchFiles(changed, () => undefined)
    const files = { ...installed.files }
    for (const file of changed) files[file.name] = file.sha256
    await swap({ ...installed, files })
  }

  async function update() {
    try {
      if (!installed) state = { state: 'checking' }
      const release = await newestRelease(fetch)
      await installFirst(release)
      state = { state: 'ready', release: release.release }
      await installLater(release)
      await storage.remove('staging')
    } catch (error) {
      state = installed
        ? { state: 'ready', release: installed.release, updateFailed: reason(error) }
        : { state: 'failed', reason: reason(error) }
    }
  }

  async function start() {
    const saved = await storage.read(installedPath)
    if (!saved) return update()
    installed = JSON.parse(new TextDecoder().decode(saved)) as Installed
    try {
      await options.open(installed)
      state = { state: 'ready', release: installed.release }
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
      updating ??= started.then(update).finally(() => {
        updating = null
      })
      return updating
    }
  }
}
