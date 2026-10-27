'use client'

import {
  listMoves,
  listsInOrder,
  nextListPosition,
  type Shown,
  wordsOfList
} from '@zenbu/account-rules/account-views'
import { listName } from '@zenbu/account-rules/lists'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { Label } from '@/components/ui/label'
import { listPath, textIn } from '@/lib/account/synced-views'
import { countOf, fill } from '@/lib/i18n/format'
import { FormMessage } from '../form-message'
import { type AreaProps, AskFirst, MoveButtons, Rows, useChanging, type Words } from './parts'

function NameForm({
  id,
  label,
  submit,
  initial,
  busy,
  words,
  onName,
  onCancel
}: {
  id: string
  label: string
  submit: string
  initial: string
  busy: boolean
  words: Words['lists']
  onName: (name: string) => Promise<boolean>
  onCancel?: () => void
}) {
  const [typed, setTyped] = useState(initial)
  const [refused, setRefused] = useState<string | null>(null)
  async function named(event: FormEvent) {
    event.preventDefault()
    const name = listName(typed)
    setRefused(name === null ? words.nameRule : null)
    if (name !== null && (await onName(name)) && !onCancel) setTyped('')
  }
  return (
    <form className="flex flex-col gap-2" onSubmit={named}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={typed} onChange={event => setTyped(event.target.value)} />
      <FormMessage problem={refused} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {submit}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            {words.cancel}
          </Button>
        ) : null}
      </div>
    </form>
  )
}

export function ListActions({
  list,
  wordCount,
  props,
  moves
}: {
  list: Shown
  wordCount: number
  props: AreaProps
  moves?: { up: (() => void) | null; down: (() => void) | null }
}) {
  const words = props.text.synced.lists
  const name = textIn(list.data, 'name')
  const [step, setStep] = useState<'shown' | 'renaming' | 'asking'>('shown')
  const { busy, problem, run } = useChanging()
  const rename = async (named: string) => {
    const done = await run(() => props.change('list', 'update', list.entityId, { name: named }))
    if (done) setStep('shown')
    return done
  }
  const remove = () => void run(() => props.change('list', 'delete', list.entityId))
  if (step === 'renaming') {
    return (
      <div className="flex flex-col gap-2">
        <NameForm
          id={`rename-${list.entityId}`}
          label={words.name}
          submit={words.save}
          initial={name}
          busy={busy}
          words={words}
          onName={rename}
          onCancel={() => setStep('shown')}
        />
        <FormMessage problem={problem} />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {moves ? (
          <MoveButtons name={name} up={moves.up} down={moves.down} busy={busy} words={words} />
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          aria-label={fill(words.renameNamed, { name })}
          onClick={() => setStep('renaming')}
        >
          {words.rename}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          aria-label={fill(words.deleteNamed, { name })}
          onClick={() => (wordCount > 0 ? setStep('asking') : remove())}
        >
          {words.delete}
        </Button>
      </div>
      {step === 'asking' ? (
        <AskFirst
          question={fill(countOf(words.confirmDelete, wordCount, props.locale), { name })}
          confirm={words.deleteList}
          keep={words.keepList}
          busy={busy}
          onConfirm={remove}
          onKeep={() => setStep('shown')}
        />
      ) : null}
      <FormMessage problem={problem} />
    </div>
  )
}

export function Lists(props: AreaProps) {
  const { copy, locale, text, change, changeAll } = props
  const words = text.synced.lists
  const { busy, problem, run } = useChanging()
  const lists = listsInOrder(copy.held('list'))
  const listWords = copy.held('listWord')
  const move = (from: number, to: number) => () =>
    void run(() =>
      changeAll(
        listMoves(lists, from, to).map(({ entityId, position }) => ({
          entity: 'list',
          operation: 'update',
          entityId,
          fields: { position }
        }))
      )
    )
  return (
    <section className="flex flex-col gap-4" aria-label={text.pages.lists.title}>
      <NameForm
        id="new-list"
        label={words.newList}
        submit={words.create}
        initial=""
        busy={busy}
        words={words}
        onName={name =>
          run(() =>
            change('list', 'create', crypto.randomUUID(), {
              name,
              position: nextListPosition(copy.held('list'))
            })
          )
        }
      />
      <Rows empty={lists.length === 0 ? words.none : null} problem={problem}>
        {lists.map((list, index) => {
          const count = wordsOfList(listWords, list.entityId).length
          return (
            <Item key={list.entityId} variant="outline">
              <ItemContent>
                <ItemTitle>
                  <Link href={listPath(list.entityId, locale)}>{textIn(list.data, 'name')}</Link>
                </ItemTitle>
                <ItemDescription>{countOf(words.count, count, locale)}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <ListActions
                  list={list}
                  wordCount={count}
                  props={props}
                  moves={{
                    up: index > 0 ? move(index, index - 1) : null,
                    down: index < lists.length - 1 ? move(index, index + 1) : null
                  }}
                />
              </ItemActions>
            </Item>
          )
        })}
      </Rows>
    </section>
  )
}
