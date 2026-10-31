import { Button } from '@zenbu/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@zenbu/ui/components/dialog'
import { Input } from '@zenbu/ui/components/input'
import {
  type SavedItemAction,
  SavedItemActions,
  type SavedItemPage
} from '@zenbu/ui/dictionary/saved-item-actions'
import { ListPlusIcon, PencilIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import type { WordState } from '../shared/account-copy'
import { savingLabels as labels } from './labels'
import { type SavingWord, useWordSaving } from './use-word-saving'

const states: WordState[] = ['unknown', 'learning', 'known']

const isState = (value: string): value is WordState => states.some(state => state === value)

function NewListDialog({
  open,
  close,
  create
}: {
  open: boolean
  close(): void
  create(name: string): void
}) {
  const [name, setName] = useState('')
  const named = name.trim()
  return (
    <Dialog open={open} onOpenChange={next => (next ? undefined : close())}>
      <DialogContent showCloseButton={false} data-new-list>
        <form
          className="flex flex-col gap-4"
          onSubmit={event => {
            event.preventDefault()
            if (!named) return
            create(named)
            setName('')
            close()
          }}
        >
          <DialogHeader>
            <DialogTitle>{labels.newList}</DialogTitle>
          </DialogHeader>
          <Input
            aria-label={labels.listName}
            placeholder={labels.listName}
            value={name}
            onChange={event => setName(event.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {labels.cancel}
            </Button>
            <Button type="submit" disabled={!named}>
              {labels.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function WordMenu({
  word,
  share,
  moreActions,
  addNote
}: {
  word: SavingWord
  share: { label: string; onSelect(): void }
  moreActions: string
  addNote?: () => void
}) {
  const saving = useWordSaving(word)
  const [naming, setNaming] = useState(false)
  const view = saving.view
  const newList: SavedItemAction = {
    id: 'newList',
    icon: PlusIcon,
    label: labels.newList,
    onSelect: () => setNaming(true)
  }
  const lists: SavedItemPage = {
    id: 'lists',
    icon: ListPlusIcon,
    label: labels.addToList,
    title: labels.lists,
    back: labels.back,
    choices: (view?.lists ?? []).map(list => ({
      id: list.id,
      label: list.name,
      checked: list.holds
    })),
    onChoose: saving.choose,
    actions: [newList]
  }
  const refused = view?.refusal
  const addToList: SavedItemAction | SavedItemPage = refused
    ? { id: 'lists', icon: ListPlusIcon, label: labels.addToList, onSelect: saving.refused }
    : lists
  const note: SavedItemAction = {
    id: 'addNote',
    icon: PencilIcon,
    label: labels.addNote,
    onSelect: () => {
      if (saving.addNote()) addNote?.()
    }
  }
  return (
    <>
      <SavedItemActions
        share={share}
        moreActions={moreActions}
        status={{
          label: labels.status,
          value: view?.state ?? 'unknown',
          disabled: view === null,
          choices: states.map(state => ({ value: state, label: labels.states[state] })),
          onValueChange: value => {
            if (isState(value)) void saving.setState(value)
          }
        }}
        groups={[[addToList, note]]}
      />
      <NewListDialog
        open={naming}
        close={() => setNaming(false)}
        create={name => saving.newList(name)}
      />
    </>
  )
}

export function StateTag({ word }: { word: SavingWord }) {
  const state = useWordSaving(word).view?.state
  return state ? <StateTagView state={state} /> : null
}

export function StateTagView({ state }: { state: WordState }) {
  if (state !== 'learning' && state !== 'known') return null
  return (
    <span
      data-state-tag={state}
      className={
        state === 'known'
          ? 'text-sm font-medium text-green-700 dark:text-green-400'
          : 'text-sm font-medium text-yellow-700 dark:text-yellow-400'
      }
    >
      {labels.tags[state]}
    </span>
  )
}
