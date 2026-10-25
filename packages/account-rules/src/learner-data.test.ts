import { describe, expect, test } from 'vitest'
import { listLimits, listName } from './lists'
import { noteText, noteTextLength } from './notes'
import { signInCode, signInCodeOf } from './sign-in-code'
import { type Case, cases, type Text, textOf } from './test/cases'
import { fitsTheWatch, type WatchNumber, watchLimits, watchText } from './watch'

describe('a sign-in code', () => {
  const codes = cases<{ length: number; accepted: (Case & { code: string })[]; refused: Case[] }>(
    'sign-in-code'
  )

  test('is six digits once trimmed, as the shared cases say', () => {
    for (const { covers, typed, code } of codes.accepted) {
      expect(signInCodeOf(textOf(typed)), covers).toBe(code)
    }
    for (const { covers, typed } of codes.refused) {
      expect(signInCodeOf(textOf(typed)), covers).toBeNull()
    }
    expect(signInCode.length).toBe(codes.length)
  })

  test("is held to the same rule by a field's pattern, which a browser matches against the whole value", () => {
    const field = new RegExp(`^(?:${signInCode.typedPattern})$`, 'v')
    for (const { covers, typed } of codes.accepted)
      expect(field.test(textOf(typed)), covers).toBe(true)
    for (const { covers, typed } of codes.refused)
      expect(field.test(textOf(typed)), covers).toBe(false)
  })
})

describe('a list name', () => {
  const names = cases<{
    most: number
    accepted: (Case & { name: Text; cutToFit?: true })[]
    refused: Case[]
  }>('list-name')

  test('is taken as the app keeps it, so nothing the app keeps is refused', () => {
    for (const { covers, typed, name, cutToFit } of names.accepted) {
      expect(listName(textOf(name)), covers).toBe(textOf(name))
      expect(listName(textOf(typed)), covers).toBe(cutToFit ? null : textOf(name))
    }
    for (const { covers, typed } of names.refused) {
      expect(listName(textOf(typed)), covers).toBeNull()
    }
    expect(listLimits.nameLength).toBe(names.most)
  })
})

describe('a note', () => {
  const notes = cases<{
    most: number
    accepted: (Case & { text: Text })[]
    refused: (Case & { blank?: true })[]
  }>('note-text')

  test('is kept and refused as the shared cases say, and never cut', () => {
    for (const { covers, typed, text } of notes.accepted) {
      expect(noteText(textOf(typed)), covers).toBe(textOf(text))
    }
    for (const { covers, typed } of notes.refused) {
      expect(noteText(textOf(typed)), covers).toBeNull()
    }
    expect(noteTextLength).toBe(notes.most)
  })
})

describe('a watch', () => {
  const watch = cases<{
    textLength: number
    texts: (Case & { sent: Text | null })[]
    numbers: { covers: string; field: WatchNumber; value: number; fits: boolean }[]
  }>('watch-fields')

  test('cuts its title and channel, and leaves a blank one out, as the shared cases say', () => {
    for (const { covers, typed, sent } of watch.texts) {
      expect(watchText(textOf(typed)), covers).toBe(sent === null ? null : textOf(sent))
    }
    expect(watchLimits.textLength).toBe(watch.textLength)
  })

  test('takes a number only within its field’s bounds', () => {
    for (const { covers, field, value, fits } of watch.numbers) {
      expect(fitsTheWatch(field, value), covers).toBe(fits)
    }
  })
})
