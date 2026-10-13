import { describe, expect, test } from 'vitest'
import {
  adjectivesByIrregularComparative,
  nounsByIrregularPlural,
  verbsByIrregularForm
} from './english-irregular-forms'

const tables = [verbsByIrregularForm, nounsByIrregularPlural, adjectivesByIrregularComparative]
const forms = tables.flatMap(table => [...table.keys()])

describe('the irregular forms', () => {
  test.each([
    ['went', 'go'],
    ['gone', 'go'],
    ['bought', 'buy'],
    ['taught', 'teach'],
    ['forgot', 'forget'],
    ['forgotten', 'forget'],
    ['had', 'have'],
    ['having', 'have'],
    ['doing', 'do']
  ])('hold the verb form 「%s」 under %s', (form, base) => {
    expect(verbsByIrregularForm.get(form)).toBe(base)
  })

  test.each([
    ['children', 'child'],
    ['leaves', 'leaf'],
    ['lives', 'life']
  ])('hold the plural 「%s」 under %s', (form, base) => {
    expect(nounsByIrregularPlural.get(form)).toBe(base)
  })

  test.each([
    ['better', 'good'],
    ['worst', 'bad']
  ])('hold the comparative or superlative 「%s」 under %s', (form, base) => {
    expect(adjectivesByIrregularComparative.get(form)).toBe(base)
  })

  test('each have one base, in one table', () => {
    expect(new Set(forms).size).toBe(forms.length)
  })

  test('are words of lowercase letters, never written as their base is', () => {
    for (const table of tables) {
      for (const [form, base] of table) {
        expect(form).toMatch(/^[a-z]+$/)
        expect(base).toMatch(/^[a-z]+$/)
        expect(form).not.toBe(base)
      }
    }
  })

  test.each([
    'left',
    'rose',
    'bit',
    'wound',
    'lay',
    'drunk',
    'people'
  ])('leave out 「%s」, which a sentence more often means as another word', form => {
    expect(forms).not.toContain(form)
  })
})
