import { describe, expect, test } from 'vitest'
import { cursorKey, cursors } from './cursor'

const ours = cursors(cursorKey('one secret'))
const at = (sequence: number, forgotten = 0) => ({ sequence, forgotten })

const beforeMarks = 'AZlSRuTwTUf7rCCRLmP65_497F4EuQSrkWgFrj8BRMUj-cSaMg'

describe('a sync cursor', () => {
  test('comes back as the journal position and forgotten mark it was made from, for the same account', () => {
    for (const sequence of [0, 1, 42, Number.MAX_SAFE_INTEGER]) {
      for (const forgotten of [0, 7, Number.MAX_SAFE_INTEGER]) {
        const cursor = ours.encode('user-a', at(sequence, forgotten))
        expect(cursor).toMatch(/^[A-Za-z0-9_-]{1,200}$/)
        expect(ours.decode('user-a', cursor)).toEqual(at(sequence, forgotten))
      }
    }
  })

  test('still reads a cursor given before cursors carried a mark, as one marked 0', () => {
    expect(ours.decode('user-a', beforeMarks)).toEqual(at(42))
    expect(ours.decode('user-b', beforeMarks)).toBeNull()
  })

  test('hides the position it holds: two cursors for one position differ, and neither shows it', () => {
    const first = ours.encode('user-a', at(3))
    const second = ours.encode('user-a', at(3))
    expect(first).not.toBe(second)
    expect(ours.decode('user-a', first)).toEqual(ours.decode('user-a', second))
    const zero = Buffer.alloc(7)
    for (const cursor of [first, second]) {
      expect(Buffer.from(cursor, 'base64url').includes(Buffer.concat([zero, Buffer.of(3)]))).toBe(
        false
      )
    }
  })

  test("is refused for another account, or when it wasn't made with this service's secret", () => {
    const cursor = ours.encode('user-a', at(42))
    expect(ours.decode('user-b', cursor)).toBeNull()
    expect(cursors(cursorKey('another secret')).decode('user-a', cursor)).toBeNull()
  })

  test('is refused when any byte of it changes', () => {
    for (const cursor of [ours.encode('user-a', at(42, 9)), beforeMarks]) {
      const bytes = Buffer.from(cursor, 'base64url')
      for (let index = 0; index < bytes.length; index++) {
        const changed = Buffer.from(bytes)
        changed[index] = (changed[index] ?? 0) ^ 1
        expect(ours.decode('user-a', changed.toString('base64url')), `byte ${index}`).toBeNull()
      }
    }
  })

  test('is refused when it is not one at all', () => {
    const cursor = ours.encode('user-a', at(42))
    for (const refused of ['', '!!!!', 'a', cursor.slice(1), `${cursor}AA`, 'a'.repeat(50), '42']) {
      expect(ours.decode('user-a', refused), refused).toBeNull()
    }
  })
})
