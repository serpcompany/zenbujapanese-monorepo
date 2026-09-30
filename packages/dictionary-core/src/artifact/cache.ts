export interface Cache<Key, Value> {
  get(key: Key): Value | undefined
  set(key: Key, value: Value): unknown
}

export class LruCache<Key, Value> implements Cache<Key, Value> {
  private readonly entries = new Map<Key, Value>()

  constructor(private readonly capacity: number) {
    if (!(capacity > 0)) throw new Error('An LruCache needs a positive capacity')
  }

  get size(): number {
    return this.entries.size
  }

  get(key: Key): Value | undefined {
    const value = this.entries.get(key)
    if (value === undefined) return undefined
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  set(key: Key, value: Value): this {
    this.entries.delete(key)
    this.entries.set(key, value)
    if (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next()
      if (!oldest.done) this.entries.delete(oldest.value)
    }
    return this
  }
}
