'use client'

import { Button } from '@zenbu/ui/components/button'
import { Checkbox } from '@zenbu/ui/components/checkbox'
import { Input } from '@zenbu/ui/components/input'
import { Label } from '@zenbu/ui/components/label'
import { PlusIcon } from 'lucide-react'
import Link from 'next/link'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import {
  listHolds,
  listPage,
  listRows,
  newListHolding,
  putInList
} from '@/lib/account/learner-items'
import { fill } from '@/lib/i18n/format'
import { localizedPath } from '@/lib/i18n/paths'
import type { SyncedPartProps } from './synced-props'

function NewList({ copy, synced, item, account }: SyncedPartProps) {
  const words = account.synced.lists
  const field = useId()
  const input = useRef<HTMLInputElement>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const creating = useRef<string | null>(null)

  useEffect(() => {
    if (naming) input.current?.focus()
  }, [naming])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const id = creating.current ?? crypto.randomUUID()
    creating.current = id
    await synced.run(held => newListHolding(held, { id, typed: name }, item), words.nameRule)
    if (!listHolds(copy, id, item)) return
    creating.current = null
    setNaming(false)
    setName('')
  }

  if (!naming) {
    return (
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={synced.busy}
        onClick={() => setNaming(true)}
      >
        <PlusIcon data-icon="inline-start" aria-hidden="true" />
        {words.newList}
      </Button>
    )
  }
  return (
    <form className="flex flex-col gap-2" onSubmit={create}>
      <Label htmlFor={field}>{words.name}</Label>
      <Input
        id={field}
        ref={input}
        value={name}
        disabled={synced.busy}
        onChange={event => setName(event.target.value)}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={synced.busy}>
          {words.create}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={synced.busy}
          onClick={() => setNaming(false)}
        >
          {words.cancel}
        </Button>
      </div>
    </form>
  )
}

export function SyncedLists(props: SyncedPartProps) {
  const { copy, item, synced, locale, text, account } = props
  const rows = listRows(copy, item)
  const field = useId()
  return (
    <div className="flex flex-col gap-4">
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{account.synced.lists.none}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map(row => (
            <li key={row.id} className="flex items-center gap-3">
              <Checkbox
                id={`${field}${row.id}`}
                checked={row.holds}
                disabled={synced.busy}
                onCheckedChange={holds =>
                  void synced.run(held => putInList(held, row.id, item, holds))
                }
              />
              <Label htmlFor={`${field}${row.id}`} className="min-w-0 flex-1">
                {row.name}
              </Label>
              <Button
                variant="ghost"
                nativeButton={false}
                render={
                  <Link
                    href={localizedPath(listPage(row.id), locale)}
                    aria-label={fill(text.synced.lists.openNamed, { name: row.name })}
                  />
                }
              >
                {text.synced.lists.open}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <NewList {...props} />
    </div>
  )
}
