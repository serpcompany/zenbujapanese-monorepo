import {
  applied,
  type Change,
  type ClientMutation,
  conflict,
  type Entity,
  gone,
  itemTextLength,
  journaled,
  needsBaseVersion,
  type Outcome,
  rejected,
  savedItemIdOf,
  uuidOf
} from './entities'
import type { WordNote } from './kept-store'
import { isRejection, type Rejection, rejection } from './profile'
import type { LockedAccount } from './store'

export const noteLimits = {
  notes: 10_000,
  textLength: 10_000,
  labelLength: itemTextLength
} as const

type Written = Pick<WordNote, 'itemId' | 'text' | 'headword' | 'reading'>

const allowed = new Set(['item', 'text', 'headword', 'reading'])
const badNote = rejection('invalid_mutation', "A note's entityId is its UUID.")
const badFields = rejection(
  'invalid_fields',
  `A note has its item (a Language Reference ID, \`kanji:\` and one kanji, or \`wn1:\` and 64 lowercase hex digits), its text (1 to ${noteLimits.textLength} characters once trimmed; line breaks and tabs are kept, other control characters become spaces), and may have the headword and reading it was saved on (at most ${noteLimits.labelLength} characters each). Nothing else.`
)
const tooMany = rejection(
  'too_many_notes',
  `An account holds at most ${noteLimits.notes.toLocaleString('en-US')} notes.`
)

const noteIdOf = uuidOf

const asChange = (note: WordNote): Change =>
  note.present && note.itemId !== null && note.text !== null
    ? {
        entity: 'wordNote',
        entityId: note.id,
        operation: 'put',
        version: note.version,
        data: {
          id: note.id,
          itemId: note.itemId,
          text: note.text,
          headword: note.headword,
          reading: note.reading
        }
      }
    : gone('wordNote', note.id, note.version)

function noteText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/\p{Cs}/gu, '\uFFFD')
    .replace(/[^\P{Cc}\n\t]/gu, ' ')
    .normalize('NFC')
    .trim()
  const length = [...text].length
  return length > 0 && length <= noteLimits.textLength ? text : null
}

function label(raw: unknown): string | null | Rejection {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') return badFields
  const text = raw.normalize('NFC').trim()
  if (/\p{Cc}|\p{Cf}|\p{Cs}/u.test(text) || [...text].length > noteLimits.labelLength) {
    return badFields
  }
  return text === '' ? null : text
}

function writtenFields(fields: Record<string, unknown>): Written | Rejection {
  if (Object.keys(fields).some(key => !allowed.has(key))) return badFields
  const itemId = savedItemIdOf(fields.item)
  const text = noteText(fields.text)
  const headword = label(fields.headword)
  const reading = label(fields.reading)
  if (!itemId || text === null || isRejection(headword) || isRejection(reading)) return badFields
  return { itemId, text, headword, reading }
}

const sameNote = (current: WordNote, next: Written) =>
  current.itemId === next.itemId &&
  current.text === next.text &&
  current.headword === next.headword &&
  current.reading === next.reading

async function save(account: LockedAccount, note: Omit<WordNote, 'updatedAt'>, operation: string) {
  await account.saveWordNote(note)
  return journaled(account, 'wordNote', note.id, note.version, operation)
}

async function write(account: LockedAccount, mutation: ClientMutation): Promise<Outcome> {
  const id = noteIdOf(mutation.entityId)
  if (!id) return rejected(badNote)
  if (mutation.baseVersion === undefined) return rejected(needsBaseVersion)
  const next = writtenFields(mutation.fields ?? {})
  if (isRejection(next)) return rejected(next)
  const current = await account.wordNote(id)
  if (current?.present) {
    if (sameNote(current, next)) return applied(current.version)
    if (mutation.baseVersion !== current.version) return conflict(asChange(current))
  } else if ((await account.wordNoteCount()) >= noteLimits.notes) {
    return rejected(tooMany)
  }
  return save(
    account,
    { id, ...next, present: true, version: (current?.version ?? 0) + 1 },
    'write'
  )
}

const erased = { itemId: null, text: null, headword: null, reading: null }

const writes = ['notes:write'] as const

export const wordNotes: Entity = {
  reads: 'notes:read',
  operations: {
    write: { needs: writes, apply: write },
    delete: {
      needs: writes,
      apply: async (account, mutation) => {
        const id = noteIdOf(mutation.entityId)
        if (!id) return rejected(badNote)
        if (mutation.baseVersion === undefined) return rejected(needsBaseVersion)
        const current = await account.wordNote(id)
        if (!current?.present) return applied(current?.version ?? 0)
        if (mutation.baseVersion !== current.version) return conflict(asChange(current))
        return save(
          account,
          { id, ...erased, present: false, version: current.version + 1 },
          'delete'
        )
      }
    }
  },
  async current(reader, entityId) {
    const id = noteIdOf(entityId) ?? entityId
    const note = await reader.wordNote(id)
    return note ? asChange(note) : gone('wordNote', id, 0)
  }
}
