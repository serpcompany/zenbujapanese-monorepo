'use client'

import { newestChangedFirst, type Shown } from '@zenbu/account-rules/account-views'
import { noteText } from '@zenbu/account-rules/notes'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { hasNoWord, itemName, textIn } from '@/lib/account/synced-views'
import { fill } from '@/lib/i18n/format'
import { FormMessage } from '../form-message'
import { type AreaProps, AskFirst, ItemLink, Rows, useChanging } from './parts'

function NoteRow({ note, props }: { note: Shown; props: AreaProps }) {
  const words = props.text.synced.notes
  const [step, setStep] = useState<'shown' | 'editing' | 'asking'>('shown')
  const [typed, setTyped] = useState(textIn(note.data, 'text'))
  const [began, setBegan] = useState<Shown | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const { busy, problem, run } = useChanging()
  const itemId = textIn(note.data, 'itemId')
  const withoutAWord = hasNoWord(itemId, props.pages)
  const name = itemName(note.data)
  async function save() {
    const text = noteText(typed)
    setRefused(text === null ? words.textRule : null)
    if (text === null) return
    const fields = {
      item: itemId,
      text,
      headword: note.data.headword ?? null,
      reading: note.data.reading ?? null
    }
    const written = props.change('wordNote', 'write', note.entityId, fields, began)
    if (await run(() => written)) setStep('shown')
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(textIn(note.data, 'text'))
      toast.success(words.copied)
    } catch {
      toast.error(words.copyFailed)
    }
  }
  const label = `note-${note.entityId}`
  return (
    <Item variant="outline">
      <ItemContent>
        {withoutAWord ? null : (
          <ItemTitle>
            <ItemLink data={note.data} locale={props.locale} pages={props.pages} />
          </ItemTitle>
        )}
        {step === 'editing' ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={label}>{words.note}</Label>
            <Textarea id={label} value={typed} onChange={event => setTyped(event.target.value)} />
            <FormMessage problem={refused} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => void save()}>
                {words.save}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setStep('shown')}
              >
                {words.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap">{textIn(note.data, 'text')}</p>
        )}
        {withoutAWord && name !== '' ? (
          <ItemDescription>{fill(words.savedOn, { name })}</ItemDescription>
        ) : null}
        {step === 'asking' ? (
          <AskFirst
            question={words.confirmDelete}
            confirm={words.deleteNote}
            keep={words.keepNote}
            busy={busy}
            onConfirm={() => void run(() => props.change('wordNote', 'delete', note.entityId))}
            onKeep={() => setStep('shown')}
          />
        ) : null}
        <FormMessage problem={problem} />
      </ItemContent>
      {step === 'shown' ? (
        <ItemActions>
          {withoutAWord ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={fill(words.copyNamed, { name })}
              onClick={() => void copy()}
            >
              {words.copy}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={fill(words.editNamed, { name })}
              onClick={() => {
                setTyped(textIn(note.data, 'text'))
                setBegan(note)
                setStep('editing')
              }}
            >
              {words.edit}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={fill(words.deleteNamed, { name })}
            onClick={() => setStep('asking')}
          >
            {words.delete}
          </Button>
        </ItemActions>
      ) : null}
    </Item>
  )
}

export function Notes(props: AreaProps) {
  const { copy, text, pages } = props
  const words = text.synced.notes
  const notes = newestChangedFirst(copy.held('wordNote'))
  const isWithoutAWord = (note: Shown) => hasNoWord(textIn(note.data, 'itemId'), pages)
  const onWords = notes.filter(note => !isWithoutAWord(note))
  const withoutAWord = notes.filter(isWithoutAWord)
  return (
    <>
      <section className="flex flex-col gap-4" aria-label={text.pages.notes.title}>
        <Rows empty={notes.length === 0 ? words.none : null} problem={null}>
          {onWords.map(note => (
            <NoteRow key={note.entityId} note={note} props={props} />
          ))}
        </Rows>
      </section>
      {withoutAWord.length > 0 ? (
        <section className="flex flex-col gap-4" aria-labelledby="notes-without-a-word">
          <h2 id="notes-without-a-word" className="text-lg font-medium">
            {words.withoutAWord}
          </h2>
          <p className="text-sm text-muted-foreground">{words.withoutAWordWhy}</p>
          <div className="flex flex-col gap-2">
            {withoutAWord.map(note => (
              <NoteRow key={note.entityId} note={note} props={props} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}
