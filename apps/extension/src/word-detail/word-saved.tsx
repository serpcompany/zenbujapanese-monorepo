import { noteTextLength } from '@zenbu/account-rules/notes'
import { fill } from '@zenbu/dictionary-core/detail/template'
import { Textarea } from '@zenbu/ui/components/textarea'
import { useEffect, useRef, useState } from 'react'
import { savingLabels as labels } from '../word-saving/labels'
import { useSaving } from '../word-saving/saving'
import { newId, type SavingWord, useWordSaving } from '../word-saving/use-word-saving'

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
  focused,
  onFocusChange
}: {
  note: string
  text: string
  label: string
  write(note: string, text: string): Promise<boolean>
  focused?: (field: HTMLTextAreaElement) => void
  onFocusChange(focused: boolean): void
}) {
  const [draft, setDraft] = useState(text)
  const saved = useRef(text)
  const latest = useRef({ note, draft: text, write })
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    latest.current = { ...latest.current, note, write }
  }, [note, write])
  useEffect(() => {
    saved.current = text
    if (field.current?.matches(':focus')) return
    latest.current.draft = text
    setDraft(text)
  }, [text])
  useEffect(() => {
    if (focused && field.current) focused(field.current)
  }, [focused])
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      const { note, draft, write } = latest.current
      if (draft !== saved.current) void write(note, draft)
    },
    []
  )
  const save = (value: string) => {
    clearTimeout(timer.current)
    if (value === saved.current) return
    const before = saved.current
    saved.current = value
    void write(note, value).then(written => {
      if (!written && saved.current === value) saved.current = before
    })
  }
  return (
    <Textarea
      ref={field}
      aria-label={label}
      data-note={note}
      value={draft}
      maxLength={noteTextLength}
      onChange={event => {
        const value = event.target.value
        latest.current.draft = value
        setDraft(value)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => save(value), notePause)
      }}
      onFocus={() => onFocusChange(true)}
      onBlur={() => {
        onFocusChange(false)
        save(draft)
      }}
    />
  )
}

export function WordNotes({ word }: { word: SavingWord }) {
  const saving = useWordSaving(word)
  const { noteFor, focusNote } = useSaving()
  const [fresh] = useState(newId)
  const [typing, setTyping] = useState<{ note: string } | null>(null)
  const kept = saving.view?.notes ?? []
  const notes = kept.length ? kept : [{ id: fresh, text: '' }]
  const keyOf = (note: string) =>
    typing && note === fresh && !kept.some(each => each.id === typing.note) ? typing.note : note
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
          key={keyOf(note.id)}
          note={note.id}
          text={note.text}
          label={label}
          write={saving.writeNote}
          focused={index === 0 && noteFor === word.item ? focused : undefined}
          onFocusChange={has => setTyping(has ? { note: note.id } : null)}
        />
      ))}
    </div>
  )
}
