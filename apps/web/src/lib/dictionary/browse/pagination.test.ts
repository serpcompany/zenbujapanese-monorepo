import { describe, expect, test } from 'vitest'
import { type PageNumber, pageNumbers } from './pagination'

const shownOn = (numbers: PageNumber[], screen: 'wide' | 'phone') =>
  numbers
    .filter(({ onPhone }) => screen === 'wide' || onPhone)
    .flatMap(({ number, gapBefore }) => [...(gapBefore[screen] ? ['…'] : []), String(number)])
    .join(' ')

describe('a list’s page numbers', () => {
  test('a wide screen shows two pages either side of the current one, and the first and last', () => {
    expect(shownOn(pageNumbers(10, 20), 'wide')).toBe('1 … 8 9 10 11 12 … 20')
    expect(shownOn(pageNumbers(2, 20), 'wide')).toBe('1 2 3 4 … 20')
    expect(shownOn(pageNumbers(20, 20), 'wide')).toBe('1 … 18 19 20')
  })

  test('a phone shows only the first, current, and last pages, so they fit one row', () => {
    expect(shownOn(pageNumbers(10, 20), 'phone')).toBe('1 … 10 … 20')
    expect(shownOn(pageNumbers(2, 20), 'phone')).toBe('1 2 … 20')
    expect(shownOn(pageNumbers(3, 20), 'phone')).toBe('1 … 3 … 20')
    expect(shownOn(pageNumbers(1, 3), 'phone')).toBe('1 … 3')
    expect(shownOn(pageNumbers(1, 2), 'phone')).toBe('1 2')
  })
})
