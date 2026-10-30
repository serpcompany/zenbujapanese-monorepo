import { type CopyStorage, type Item, itemKey, type Meta, type Saved } from './kept'

const copyDatabase = 'zenbu-account-copy'

const items = 'items'
const meta = 'meta'
const metaKey = 'meta'

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const finished = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

function opened(factory: IDBFactory): Promise<IDBDatabase> {
  const request = factory.open(copyDatabase, 1)
  request.onupgradeneeded = () => {
    request.result.createObjectStore(items)
    request.result.createObjectStore(meta)
  }
  return done(request)
}

export function indexedStorage(factory: IDBFactory = indexedDB): CopyStorage {
  let database: Promise<IDBDatabase> | null = null
  const open = () => {
    database ??= opened(factory).catch((error: unknown) => {
      database = null
      throw error
    })
    return database
  }
  return {
    async load() {
      const transaction = (await open()).transaction([items, meta], 'readonly')
      const [kept, held] = await Promise.all([
        done(transaction.objectStore(items).getAll() as IDBRequest<Item[]>),
        done(transaction.objectStore(meta).get(metaKey) as IDBRequest<Meta | undefined>)
      ])
      return { items: kept, meta: held ?? null }
    },
    async save(saved: Saved) {
      const transaction = (await open()).transaction([items, meta], 'readwrite')
      const store = transaction.objectStore(items)
      if (saved.replace) store.clear()
      for (const key of saved.remove) store.delete(key)
      for (const item of saved.put) store.put(item, itemKey(item))
      if (saved.meta) transaction.objectStore(meta).put(saved.meta, metaKey)
      else transaction.objectStore(meta).delete(metaKey)
      await finished(transaction)
    }
  }
}
