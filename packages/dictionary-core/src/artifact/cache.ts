export interface Cache<Key, Value> {
  get(key: Key): Value | undefined
  set(key: Key, value: Value): unknown
}

interface Kept<Value> {
  value: Value
  used: number
}

export class LruCache<Key, Value> implements Cache<Key, Value> {
  private readonly entries = new Map<Key, Kept<Value>>()
  private readonly settled: number
  private uses = 0

  constructor(private readonly capacity: number) {
    if (!(capacity > 0)) throw new Error('An LruCache needs a positive capacity')
    this.settled = Math.floor(capacity / 2)
  }

  get size(): number {
    return this.entries.size
  }

  get(key: Key): Value | undefined {
    const kept = this.entries.get(key)
    if (kept === undefined) return undefined
    if (this.uses - kept.used >= this.settled) {
      this.entries.delete(key)
      kept.used = ++this.uses
      this.entries.set(key, kept)
    }
    return kept.value
  }

  set(key: Key, value: Value): this {
    this.entries.delete(key)
    this.entries.set(key, { value, used: ++this.uses })
    if (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next()
      if (!oldest.done) this.entries.delete(oldest.value)
    }
    return this
  }
}
