export interface FileAccess {
  size(): number
  read(into: Uint8Array, at: number): number
  write(bytes: Uint8Array, at: number): void
  truncate(size: number): void
  flush(): void
  close(): void
}

export interface Storage {
  access(path: string): Promise<FileAccess>
  read(path: string): Promise<Uint8Array | null>
  write(path: string, bytes: Uint8Array): Promise<void>
  move(from: string, to: string): Promise<void>
  remove(path: string): Promise<void>
}

type SyncAccessHandle = {
  getSize(): number
  read(buffer: Uint8Array, options: { at: number }): number
  write(buffer: Uint8Array, options: { at: number }): number
  truncate(size: number): void
  flush(): void
  close(): void
}

type MovableFile = FileSystemFileHandle & {
  createSyncAccessHandle(): Promise<SyncAccessHandle>
  move(folder: FileSystemDirectoryHandle, name: string): Promise<void>
}

const isMissing = (error: unknown) =>
  error instanceof DOMException && error.name === 'NotFoundError'

function split(path: string): { folders: string[]; name: string } {
  const parts = path.split('/').filter(part => part !== '')
  const name = parts.pop()
  if (!name) throw new Error(`"${path}" names no file`)
  return { folders: parts, name }
}

export function originPrivateStorage(
  root: () => Promise<FileSystemDirectoryHandle> = () => navigator.storage.getDirectory()
): Storage {
  async function folder(names: readonly string[]) {
    let at = await root()
    for (const name of names) at = await at.getDirectoryHandle(name, { create: true })
    return at
  }

  async function file(path: string, create: boolean) {
    const { folders, name } = split(path)
    return (await (await folder(folders)).getFileHandle(name, { create })) as MovableFile
  }

  return {
    async access(path) {
      const handle = await (await file(path, true)).createSyncAccessHandle()
      return {
        size: () => handle.getSize(),
        read: (into, at) => handle.read(into, { at }),
        write: (bytes, at) => {
          handle.write(bytes, { at })
        },
        truncate: size => handle.truncate(size),
        flush: () => handle.flush(),
        close: () => handle.close()
      }
    },
    async read(path) {
      try {
        const found = await (await file(path, false)).getFile()
        return new Uint8Array(await found.arrayBuffer())
      } catch (error) {
        if (isMissing(error)) return null
        throw error
      }
    },
    async write(path, bytes) {
      const handle = await (await file(path, true)).createSyncAccessHandle()
      try {
        handle.truncate(0)
        handle.write(bytes, { at: 0 })
        handle.flush()
      } finally {
        handle.close()
      }
    },
    async move(from, to) {
      const target = split(to)
      await (await file(from, false)).move(await folder(target.folders), target.name)
    },
    async remove(path) {
      const { folders, name } = split(path)
      try {
        await (await folder(folders)).removeEntry(name, { recursive: true })
      } catch (error) {
        if (!isMissing(error)) throw error
      }
    }
  }
}
