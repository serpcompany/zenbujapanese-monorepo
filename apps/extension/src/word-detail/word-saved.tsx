import { fill } from '@zenbu/dictionary-core/detail/template'
import { Textarea } from '@zenbu/ui/components/textarea'
import { useEffect, useRef, useState } from 'react'
import { useSaving } from '../word-saving/saving'
import { newId, type SavingWord, useWordSaving } from '../word-saving/use-word-saving'
import { wordDetailLabels } from './labels'

const labels = wordDetailLabels.saving

export const notePause = 1_000

export function WordLists({ word }: { word: SavingWord }) {
  const lists = useWordSaving(word).view?.lists.filter(list => list.holds) ?? []
  if (lists.length === 0) {
    return <p className="text-sm text-muted-foreground">{labels.noLists}</p>
  }
  return (
    <ul className="flex flex-col gap-1 text-sm" data-word-lists>
      {lists.map(list => (
        <li key={list.id}>{list.name}</li>
      ))}
    </ul>
  )
}

function NoteField({
  note,
  text,
  label,
  write,
  focused
}: {
  note: string
  text: string
  label: string
  write(note: string, text: string): Promise<boolean>
  focused?: (field: HTMLTextAreaElement) => void
}) {
  const [draft, setDraft] = useState(text)
  const saved = useRef(text)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    saved.current = text
    if (!field.current?.matches(':focus')) setDraft(text)
  }, [text])
  useEffect(() => {
    if (focused && field.current) focused(field.current)
  }, [focused])
  useEffect(() => () => clearTimeout(timer.current), [])
  const save = (value: string) => {
    clearTimeout(timer.current)
    if (value === saved.current) return
    void write(note, value).then(written => {
      if (written) saved.current = value
    })
  }
  return (
    <Textarea
      ref={field}
      aria-label={label}
      data-note={note}
      value={draft}
      onChange={event => {
        const value = event.target.value
        setDraft(value)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => save(value), notePause)
      }}
      onBlur={() => save(draft)}
    />
  )
}

export function WordNotes({ word }: { word: SavingWord }) {
  const saving = useWordSaving(word)
  const { noteFor, focusNote } = useSaving()
  const [fresh] = useState(newId)
  const notes = saving.view?.notes.length ? saving.view.notes : [{ id: fresh, text: '' }]
  const label = fill(labels.note, { name: word.headword })
  const focused = (field: HTMLTextAreaElement) => {
    field.focus({ preventScroll: true })
    field.scrollIntoView?.({ block: 'nearest' })
    focusNote(null)
  }
  return (
    <div className="flex flex-col gap-2" data-word-notes>
      {notes.map((note, index) => (
        <NoteField
          key={note.id}
          note={note.id}
          text={note.text}
          label={label}
          write={saving.writeNote}
          focused={index === 0 && noteFor === word.item ? focused : undefined}
        />
      ))}
    </div>
  )
}
