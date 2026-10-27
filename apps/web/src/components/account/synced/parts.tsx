'use client'

import type { Change } from '@zenbu/account-rules/account-copy'
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import Link from 'next/link'
import { type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Result } from '@/lib/account/client'
import type { AccountText } from '@/lib/account/messages'
import type { SyncedCopy } from '@/lib/account/synced'
import { itemName, itemPath, textIn } from '@/lib/account/synced-views'
import type { Locale } from '@/lib/i18n/config'
import { fill } from '@/lib/i18n/format'
import { FormMessage } from '../form-message'

export type Fields = Record<string, unknown>

export interface Said {
  problem: string | null
  done: boolean
}

export interface AreaProps {
  copy: SyncedCopy
  locale: Locale
  text: AccountText
  listId: string | null
  change: (entity: string, operation: string, entityId: string, fields?: Fields) => Promise<Said>
  changeAll: (changes: Change[]) => Promise<Said>
  photoFile: (photoId: string) => Promise<Result<Blob>>
}

export function useChanging() {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  async function run(work: () => Promise<Said>) {
    setBusy(true)
    setProblem(null)
    const said = await work()
    setProblem(said.problem)
    setBusy(false)
    return said.done
  }
  return { busy, problem, setProblem, run }
}

export function ItemLink({ data, locale }: { data: Fields; locale: Locale }) {
  const name = itemName(data)
  const path = itemPath(textIn(data, 'itemId'), textIn(data, 'headword'), locale)
  return path ? <Link href={path}>{name}</Link> : <span>{name}</span>
}

export function AskFirst({
  question,
  confirm,
  keep,
  busy,
  onConfirm,
  onKeep
}: {
  question: string
  confirm: string
  keep: string
  busy: boolean
  onConfirm: () => void
  onKeep: () => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4">
      <p className="text-sm">{question}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="destructive" disabled={busy} onClick={onConfirm}>
          {confirm}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onKeep}>
          {keep}
        </Button>
      </div>
    </div>
  )
}

export function Filter({
  id,
  label,
  value,
  onChange
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="search" value={value} onChange={event => onChange(event.target.value)} />
    </div>
  )
}

export function Rows({
  empty,
  problem,
  children
}: {
  empty: string | null
  problem: string | null
  children: ReactNode
}) {
  return (
    <>
      <FormMessage problem={problem} />
      {empty ? <p className="text-muted-foreground">{empty}</p> : null}
      <div className="flex flex-col gap-2">{children}</div>
    </>
  )
}

export function MoveButtons({
  name,
  up,
  down,
  busy,
  words
}: {
  name: string
  up: (() => void) | null
  down: (() => void) | null
  busy: boolean
  words: { moveUp: string; moveDown: string }
}) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled={busy || !up}
        aria-label={fill(words.moveUp, { name })}
        onClick={() => up?.()}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled={busy || !down}
        aria-label={fill(words.moveDown, { name })}
        onClick={() => down?.()}
      >
        <ArrowDownIcon />
      </Button>
    </>
  )
}

export type Words = AccountText['synced']
