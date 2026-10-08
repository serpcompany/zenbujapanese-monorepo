import { expect, test } from 'vitest'
import { readPort } from './config'

test('reads a port, or falls back to the given one', () => {
  expect(readPort('8080', 8789)).toBe(8080)
  expect(readPort(undefined, 8789)).toBe(8789)
  for (const value of ['eighty', '0', '-1', '1.5', '70000']) {
    expect(() => readPort(value, 8789), value).toThrow(`PORT is ${value}`)
  }
})
