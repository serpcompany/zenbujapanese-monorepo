import { listNameCases, noteTextCases, textOf } from '@zenbu/account-rules/test/cases'
import { describe, expect, it } from 'vitest'
import { favorites, word } from '../../test/copy-world'
import { changeOf } from './copy-changes'

const note = '6f1c2b8e-4d3a-4f5b-9c7d-0e1f2a3b4c5d'

const named = (typed: string) =>
  changeOf({ change: 'create-list', list: favorites, name: typed, position: 0 })

const written = (typed: string) =>
  changeOf({ change: 'write-note', note, item: word.item, text: typed })

describe("the copy holds a page's change to the account rules", () => {
  it.each(
    listNameCases.accepted
  )('keeps a list named with $covers, unless it must be cut', each => {
    const kept = named(textOf(each.typed))
    if (each.cutToFit) expect(kept).toBeNull()
    else expect(kept).toMatchObject({ name: textOf(each.name) })
  })

  it.each(listNameCases.refused)('refuses a list named with $covers', each => {
    expect(named(textOf(each.typed))).toBeNull()
  })

  it.each(noteTextCases.accepted)('keeps a note of $covers', each => {
    expect(written(textOf(each.typed))).toMatchObject({ text: textOf(each.text) })
  })

  it.each(noteTextCases.refused)('refuses a note of $covers', each => {
    expect(written(textOf(each.typed))).toBeNull()
  })
})
