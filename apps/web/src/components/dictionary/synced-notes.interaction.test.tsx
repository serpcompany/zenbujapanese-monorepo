import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { submit } from '@/test/account-page'
import {
  accountPagesOpen,
  dialog,
  forgetAll,
  kanji,
  labels,
  learnerText,
  loaded,
  named,
  openFromTheMenu,
  press,
  renderActions,
  renderPrompt,
  signedInHere,
  standingIn,
  syncedText,
  typeInto,
  word
} from '@/test/learner-actions'

vi.hoisted(() => vi.stubEnv('ZENBU_ACCOUNT_PAGES', 'open'))
afterEach(forgetAll)

const noteId = '5e8d1c2b-7a6f-4d3e-8b9c-000000000001'
const notes = syncedText.notes

const note = (number: number) => named<HTMLTextAreaElement>('textarea', `Note ${number}`)
const shownNotes = () =>
  [...dialog().querySelectorAll<HTMLTextAreaElement>('textarea[aria-label]')].map(
    field => field.value
  )

async function openNotes() {
  renderPrompt('notes')
  await press('button', 'Add Note')
  await loaded(learnerText.synced.notes.newNote)
}

async function writeANote(text: string) {
  await typeInto(named<HTMLTextAreaElement>('textarea', learnerText.synced.notes.newNote), text)
  await submit(dialog(), learnerText.addNote)
}

describe('signed in with a subscription, Notes', () => {
  beforeEach(() => {
    accountPagesOpen()
    signedInHere()
  })

  test('a note is written, changed, and deleted after asking', async () => {
    const standIn = standingIn()
    await openNotes()
    expect(standIn.reads).toEqual([`wordNote?limit=500&item=${word.id}`])
    await writeANote('「要る」は必要。')
    await vi.waitFor(() => expect(note(1).value).toBe('「要る」は必要。'))
    const written = standIn.sent[0]?.entityId ?? ''
    expect(standIn.dataOf('wordNote', written)).toEqual({
      id: written,
      itemId: word.id,
      text: '「要る」は必要。',
      headword: word.headword,
      reading: word.reading
    })
    expect(named<HTMLTextAreaElement>('textarea', learnerText.synced.notes.newNote).value).toBe('')

    await typeInto(note(1), '  「要る」は need.  ')
    await press('button', 'Save note 1')
    await vi.waitFor(() => expect(note(1).value).toBe('「要る」は need.'))
    expect(standIn.dataOf('wordNote', written)).toMatchObject({ text: '「要る」は need.' })

    await press('button', 'Delete note 1')
    await loaded(notes.confirmDelete)
    expect(standIn.sent).toHaveLength(2)
    await press('button', notes.deleteNote)
    await vi.waitFor(() => expect(shownNotes()).toEqual([]))
    expect(standIn.dataOf('wordNote', written)).toBeNull()
    expect(standIn.sent.map(each => [each.operation, each.baseVersion])).toEqual([
      ['write', 0],
      ['write', 1],
      ['delete', 2]
    ])
  })

  test('Keep It keeps the note, and a blank note is never sent', async () => {
    const standIn = standingIn()
    standIn.holds('wordNote', noteId, { id: noteId, itemId: word.id, text: 'mine', ...labels })
    await openNotes()
    await press('button', 'Delete note 1')
    await press('button', notes.keepNote)
    expect(shownNotes()).toEqual(['mine'])
    await typeInto(note(1), ' \n ')
    await press('button', 'Save note 1')
    await loaded(notes.textRule)
    await writeANote('   ')
    expect(standIn.sent).toEqual([])
  })

  test("a note changed elsewhere first keeps the learner's text as a new note beside it", async () => {
    const standIn = standingIn()
    standIn.holds('wordNote', noteId, { id: noteId, itemId: word.id, text: 'first', ...labels })
    await openNotes()
    standIn.holds('wordNote', noteId, { id: noteId, itemId: word.id, text: 'theirs', ...labels }, 2)
    await typeInto(note(1), 'mine')
    await press('button', 'Save note 1')
    await loaded(notes.keptAsNew)
    expect(shownNotes()).toEqual(['theirs', 'mine'])
    expect(standIn.dataOf('wordNote', noteId)).toMatchObject({ text: 'theirs' })
  })

  test('the notes keep their places when one is saved', async () => {
    const standIn = standingIn()
    const other = noteId.replace(/1$/, '2')
    standIn
      .holds('wordNote', noteId, { id: noteId, itemId: word.id, text: 'one', ...labels })
      .holds('wordNote', other, { id: other, itemId: word.id, text: 'two', ...labels })
    await openNotes()
    await typeInto(note(1), 'one, changed')
    await press('button', 'Save note 1')
    await vi.waitFor(() => {
      expect(standIn.sent).toHaveLength(1)
      expect(named<HTMLButtonElement>('button', 'Save note 1').disabled).toBe(false)
    })
    expect(standIn.reads).toHaveLength(2)
    expect(shownNotes()).toEqual(['one, changed', 'two'])
  })

  test("a kanji's notes are on the kanji, from its More actions", async () => {
    const standIn = standingIn()
    renderActions(kanji)
    await openFromTheMenu('Add Note', kanji)
    await loaded(learnerText.synced.notes.newNote)
    await writeANote('かなめ')
    await vi.waitFor(() => expect(shownNotes()).toEqual(['かなめ']))
    expect(standIn.sent[0]?.fields).toEqual({
      item: 'kanji:要',
      text: 'かなめ',
      headword: '要',
      reading: 'ヨウ'
    })
  })
})
