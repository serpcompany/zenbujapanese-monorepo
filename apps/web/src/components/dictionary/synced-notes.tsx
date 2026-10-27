'use client'

import { type FormEvent, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  type Attempt,
  deleteNote,
  type NoteRow,
  noteRows,
  writeNote
} from '@/lib/account/learner-items'
import type { SyncedCopy } from '@/lib/account/synced'
import { fill } from '@/lib/i18n/format'
import type { SyncedPartProps } from './synced-props'

type Change = (attempt: (copy: SyncedCopy) => Promise<Attempt>) => Promise<boolean>

const showsTheAccount = new Set<Attempt['status'] | null>(['applied', 'kept-as-new', 'conflict'])

function SavedNote({
  note,
  number,
  draft,
  onDraft,
  change,
  item,
  synced,
  text,
  account
}: Omit<SyncedPartProps, 'copy' | 'locale'> & {
  note: NoteRow
  number: number
  draft: string | undefined
  onDraft: (text: string | undefined) => void
  change: Change
}) {
  const words = account.synced.notes
  const named = { number }
  const { busy } = synced
  const [confirming, setConfirming] = useState(false)

  async function save() {
    if (await change(copy => writeNote(copy, item, note.id, draft ?? note.text))) {
      onDraft(undefined)
    }
  }

  async function remove() {
    const removed = await change(copy => deleteNote(copy, item, note.id))
    setConfirming(false)
    if (removed) onDraft(undefined)
  }

  return (
    <li className="flex flex-col gap-2">
      <Textarea
        aria-label={fill(text.synced.notes.numbered, named)}
        value={draft ?? note.text}
        disabled={busy}
        onChange={event => onDraft(event.target.value)}
      />
      {confirming ? (
        <div className="flex flex-col gap-2">
          <p>{words.confirmDelete}</p>
          <div className="flex gap-2">
            <Button type="button" variant="destructive" disabled={busy} onClick={remove}>
              {words.deleteNote}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              {words.keepNote}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            type="button"
            aria-label={fill(text.synced.notes.saveNumbered, named)}
            disabled={busy}
            onClick={save}
          >
            {words.save}
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label={fill(text.synced.notes.deleteNumbered, named)}
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            {words.delete}
          </Button>
        </div>
      )}
    </li>
  )
}

export function SyncedNotes({ copy, item, synced, text, account }: SyncedPartProps) {
  const field = useId()
  const [order, setOrder] = useState<string[]>([])
  const [drafts, setDrafts] = useState<ReadonlyMap<string, string>>(new Map())
  const [fresh, setFresh] = useState('')
  const [freshId, setFreshId] = useState(() => crypto.randomUUID())
  const notes = noteRows(copy, order)

  async function change(attempt: (held: SyncedCopy) => Promise<Attempt>) {
    setOrder(notes.map(note => note.id))
    return showsTheAccount.has(await synced.run(attempt, account.synced.notes.textRule))
  }

  const draftOf = (noteId: string) => (typed: string | undefined) =>
    setDrafts(current => {
      const next = new Map(current)
      if (typed === undefined) next.delete(noteId)
      else next.set(noteId, typed)
      return next
    })

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!(await change(held => writeNote(held, item, freshId, fresh)))) return
    setFresh('')
    setFreshId(crypto.randomUUID())
  }

  return (
    <div className="flex flex-col gap-4">
      {notes.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {notes.map((note, index) => (
            <SavedNote
              key={note.id}
              note={note}
              number={index + 1}
              draft={drafts.get(note.id)}
              onDraft={draftOf(note.id)}
              change={change}
              item={item}
              synced={synced}
              text={text}
              account={account}
            />
          ))}
        </ul>
      ) : null}
      <form className="flex flex-col gap-2" onSubmit={add}>
        <Label htmlFor={field}>{text.synced.notes.newNote}</Label>
        <Textarea
          id={field}
          value={fresh}
          disabled={synced.busy}
          onChange={event => setFresh(event.target.value)}
        />
        <Button type="submit" className="self-start" disabled={synced.busy}>
          {text.addNote}
        </Button>
      </form>
    </div>
  )
}
