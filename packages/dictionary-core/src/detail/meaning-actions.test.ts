import { describe, expect, test } from 'vitest'
import { meaningActions, meaningGlosses, spokenGloss } from './meaning-actions'

describe('meaningGlosses', () => {
  test('splits a meaning at the commas outside parentheses', () => {
    expect(meaningGlosses('dog (Canis (lupus) familiaris), canine')).toEqual([
      'dog (Canis (lupus) familiaris)',
      'canine'
    ])
    expect(
      meaningGlosses(
        'to hang up (e.g. a coat, a picture on the wall), to let hang, to suspend (from)'
      )
    ).toEqual([
      'to hang up (e.g. a coat, a picture on the wall)',
      'to let hang',
      'to suspend (from)'
    ])
  })

  test('is the whole meaning when it has one gloss', () => {
    expect(meaningGlosses('to eat')).toEqual(['to eat'])
  })
})

describe('spokenGloss', () => {
  test('drops a parenthesis that ends a gloss, nested or repeated', () => {
    expect(spokenGloss('dog (Canis (lupus) familiaris)')).toBe('dog')
    expect(spokenGloss('to make (a call) (on the phone)')).toBe('to make')
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
        noteText: 'Usually written in kana'
      })
    ).toEqual({
      spoken: 'squealer, rat, snitch, informer, informant, spy',
      glosses: ['squealer', 'rat', 'snitch', 'informer', 'informant', 'spy'],
      copyText: 'squealer, rat, snitch, informer, informant, spy\nUsually written in kana'
    })
  })

  test('says a gloss once', () => {
    expect(
      meaningActions({ meaning: 'to live on (e.g. a salary), to live on', noteText: null })
    ).toEqual({
      spoken: 'to live on',
      glosses: ['to live on'],
      copyText: 'to live on (e.g. a salary), to live on'
    })
  })

  test('speaks the meaning as written when no gloss is left', () => {
    expect(meaningActions({ meaning: ' () ', noteText: null }).spoken).toBe('()')
  })
})
