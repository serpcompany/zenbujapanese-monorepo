import { describe, expect, test } from 'vitest'
import { fill, templateParts } from './template'

describe('templates', () => {
  test('fill puts values into a whole sentence and leaves unknown placeholders alone', () => {
    expect(fill('Updated {date}', { date: 'today' })).toBe('Updated today')
    expect(fill('{count} of {total}', { count: 1, total: 3 })).toBe('1 of 3')
    expect(fill('{missing} stays', {})).toBe('{missing} stays')
  })

  test('templateParts splits a template at its placeholders', () => {
    expect(templateParts('Email {address} today.')).toEqual([
      { text: 'Email ' },
      { text: '{address}', name: 'address' },
      { text: ' today.' }
    ])
  })
})
