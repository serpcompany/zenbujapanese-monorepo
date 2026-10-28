'use client'

import {
  listMoves,
  listsInOrder,
  nextListPosition,
  type Shown,
  wordsOfList
} from '@zenbu/account-rules/account-views'
import { listName } from '@zenbu/account-rules/lists'
import { Button } from '@zenbu/ui/components/button'
import { Input } from '@zenbu/ui/components/input'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle
} from '@zenbu/ui/components/item'
import { Label } from '@zenbu/ui/components/label'
import Link from 'next/link'
import { type FormEvent, type ReactNode, useRef, useState } from 'react'
import { ownLists } from '@/lib/account/daily-lists'
import { accountPages } from '@/lib/account/pages'
import { dailyListsPath, listPath, textIn } from '@/lib/account/synced-views'
import type { Locale } from '@/lib/i18n/config'
import { countOf, fill } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'
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

export function ListRow({
  href,
  title,
  description,
  children
}: {
  href: string
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <Item variant="outline">
      <ItemContent>
        <ItemTitle>
          <Link href={href}>{title}</Link>
        </ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      {children ? <ItemActions>{children}</ItemActions> : null}
    </Item>
  )
}

export function AllLists({ locale, words }: { locale: Locale; words: Words['lists'] }) {
  return (
    <Link href={localizedPath(accountPages.lists.path, locale)} className="self-start text-sm">
      {words.allLists}
    </Link>
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
  moves?: { up: (() => void) | null; down: (() => void) | null; busy: boolean }
}) {
  const words = props.text.synced.lists
  const name = textIn(list.data, 'name')
  const [step, setStep] = useState<'shown' | 'renaming' | 'asking'>('shown')
  const [began, setBegan] = useState<Shown | null>(null)
  const { busy, problem, run } = useChanging()
  const rename = async (named: string) => {
    const renamed = props.change('list', 'update', list.entityId, { name: named }, began)
    const done = await run(() => renamed)
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
          <MoveButtons
            name={name}
            up={moves.up}
            down={moves.down}
            busy={busy || moves.busy}
            words={words}
          />
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          aria-label={fill(words.renameNamed, { name })}
          onClick={() => {
            setBegan(list)
            setStep('renaming')
          }}
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
  const { busy, problem, setProblem, run } = useChanging()
  const creating = useRef<string | null>(null)
  const everyList = listsInOrder(copy.held('list'))
  const lists = ownLists(everyList)
  const dailyCount = everyList.length - lists.length
  const create = async (name: string) => {
    const id = creating.current ?? crypto.randomUUID()
    creating.current = id
    const position = nextListPosition(ownLists(copy.held('list')))
    const made = await run(() => change('list', 'create', id, { name, position }))
    const held = Boolean(copy.heldOne('list', id)?.data)
    if (!made && !held) return false
    creating.current = null
    if (!made) setProblem(null)
    return true
  }
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
      {dailyCount > 0 ? (
        <ListRow
          href={dailyListsPath(locale)}
          title={words.dailyLists}
          description={countOf(words.dailyCount, dailyCount, locale)}
        />
      ) : null}
      <NameForm
        id="new-list"
        label={words.newList}
        submit={words.create}
        initial=""
        busy={busy}
        words={words}
        onName={create}
      />
      <Rows empty={lists.length === 0 ? words.none : null} problem={problem}>
        {lists.map((list, index) => {
          const count = wordsOfList(listWords, list.entityId).length
          return (
            <ListRow
              key={list.entityId}
              href={listPath(list.entityId, locale)}
              title={textIn(list.data, 'name')}
              description={countOf(words.count, count, locale)}
            >
              <ListActions
                list={list}
                wordCount={count}
                props={props}
                moves={{
                  up: index > 0 ? move(index, index - 1) : null,
                  down: index < lists.length - 1 ? move(index, index + 1) : null,
                  busy
                }}
              />
            </ListRow>
          )
        })}
      </Rows>
    </section>
  )
}
