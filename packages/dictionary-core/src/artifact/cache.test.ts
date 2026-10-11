import { describe, expect, test } from 'vitest'
import { LruCache } from './cache'

describe('LruCache', () => {
  test('keeps what was set, up to its capacity, and drops the oldest first', () => {
    const cache = new LruCache<string, number>(3)
    for (const [key, value] of Object.entries({ a: 1, b: 2, c: 3, d: 4 })) cache.set(key, value)
    expect(cache.size).toBe(3)
    expect(cache.get('a')).toBeUndefined()
    expect([cache.get('b'), cache.get('c'), cache.get('d')]).toEqual([2, 3, 4])
  })

  test('keeps an entry that was read over one that was not', () => {
    const cache = new LruCache<string, number>(2)
    cache.set('a', 1).set('b', 2)
    expect(cache.get('a')).toBe(1)
    cache.set('c', 3)
    expect(cache.get('b')).toBeUndefined()
    expect([cache.get('a'), cache.get('c')]).toEqual([1, 3])
  })

  test('an entry read while half the cache is newer than it outlives that half', () => {
    const cache = new LruCache<number, number>(8)
    for (let key = 0; key < 8; key++) cache.set(key, key)
    expect(cache.get(0)).toBe(0)
    for (let key = 8; key < 15; key++) cache.set(key, key)
    expect(cache.get(0)).toBe(0)
    expect(cache.get(1)).toBeUndefined()
  })

  test('an entry among the newer half stays where it is when read', () => {
    const cache = new LruCache<number, number>(8)
    for (let key = 0; key < 8; key++) cache.set(key, key)
    expect(cache.get(6)).toBe(6)
    for (let key = 8; key < 15; key++) cache.set(key, key)
    expect(cache.get(6)).toBeUndefined()
    expect(cache.get(7)).toBe(7)
  })

  test('replaces a value set again, and counts it once', () => {
    const cache = new LruCache<string, number>(2)
    cache.set('a', 1).set('a', 2)
    expect(cache.size).toBe(1)
    expect(cache.get('a')).toBe(2)
  })

  test('needs room for at least one entry', () => {
    expect(() => new LruCache<string, number>(0)).toThrow('An LruCache needs a positive capacity')
  })
})
