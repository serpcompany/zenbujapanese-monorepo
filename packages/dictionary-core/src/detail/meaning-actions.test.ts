import { describe, expect, test } from 'vitest'
import { meaningActions, spokenGloss } from './meaning-actions'

describe('spokenGloss', () => {
  test('drops a parenthesis that ends a gloss, nested or repeated', () => {
    expect(spokenGloss('dog (Canis (lupus) familiaris)')).toBe('dog')
    expect(spokenGloss('to make (a call) (on the phone)')).toBe('to make')
    expect(spokenGloss('to hang up (e.g. a coat, a picture on the wall)')).toBe('to hang up')
  })

  test('reads a leading parenthesis as words', () => {
    expect(spokenGloss('(not) easily')).toBe('not easily')
    expect(spokenGloss('(abbr)')).toBe('abbr')
  })

  test('reads a parenthesis inside a gloss as words', () => {
    expect(spokenGloss('to begin (but not complete) ...')).toBe('to begin but not complete ...')
  })
})

describe('meaningActions', () => {
  test('speaks each gloss by the rule and never the note line', () => {
    expect(
      meaningActions({
        meaning: 'dog (Canis (lupus) familiaris), canine',
        glosses: ['dog (Canis (lupus) familiaris)', 'canine'],
        noteText: null
      })
    ).toEqual({
      spoken: 'dog, canine',
      glosses: ['dog', 'canine'],
      copyText: 'dog (Canis (lupus) familiaris), canine'
    })
    expect(
      meaningActions({
        meaning: 'squealer, rat, snitch, informer, informant, spy',
        glosses: ['squealer', 'rat', 'snitch', 'informer', 'informant', 'spy'],
        noteText: 'Usually written in kana'
      })
    ).toEqual({
      spoken: 'squealer, rat, snitch, informer, informant, spy',
      glosses: ['squealer', 'rat', 'snitch', 'informer', 'informant', 'spy'],
      copyText: 'squealer, rat, snitch, informer, informant, spy\nUsually written in kana'
    })
  })

  test('keeps a gloss whole when it holds a comma of its own', () => {
    expect(
      meaningActions({
        meaning: 'Ministry of Health, Labour and Welfare, MHLW',
        glosses: ['Ministry of Health, Labour and Welfare', 'MHLW'],
        noteText: null
      })
    ).toEqual({
      spoken: 'Ministry of Health, Labour and Welfare, MHLW',
      glosses: ['Ministry of Health, Labour and Welfare', 'MHLW'],
      copyText: 'Ministry of Health, Labour and Welfare, MHLW'
    })
    expect(
      meaningActions({
        meaning: '100,000, hundred thousand',
        glosses: ['100,000', 'hundred thousand'],
        noteText: null
      })
    ).toEqual({
      spoken: '100,000, hundred thousand',
      glosses: ['100,000', 'hundred thousand'],
      copyText: '100,000, hundred thousand'
    })
  })

  test('says a gloss once', () => {
    expect(
      meaningActions({
        meaning: 'to live on (e.g. a salary), to live on',
        glosses: ['to live on (e.g. a salary)', 'to live on'],
        noteText: null
      })
    ).toEqual({
      spoken: 'to live on',
      glosses: ['to live on'],
      copyText: 'to live on (e.g. a salary), to live on'
    })
  })

  test('speaks the meaning as written when no gloss is left', () => {
    expect(meaningActions({ meaning: ' () ', glosses: ['()'], noteText: null })).toEqual({
      spoken: '()',
      glosses: [],
      copyText: ' () '
    })
    expect(meaningActions({ meaning: 'to eat', glosses: [], noteText: null }).spoken).toBe('to eat')
  })
})
