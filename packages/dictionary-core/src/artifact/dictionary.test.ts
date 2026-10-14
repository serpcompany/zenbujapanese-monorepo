import { expect, test } from 'vitest'
import { isReadableLength } from './dictionary'

test('a query or form is readable up to 200 code points', () => {
  expect(isReadableLength('a'.repeat(200))).toBe(true)
  expect(isReadableLength('a'.repeat(201))).toBe(false)
})

test('a character outside the BMP counts once, in code points', () => {
  expect(isReadableLength(String.fromCodePoint(0x20000).repeat(200))).toBe(true)
})
