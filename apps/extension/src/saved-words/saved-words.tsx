import { Button } from '@zenbu/ui/components/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle
} from '@zenbu/ui/components/item'
import { CircleCheck, Contrast, List, NotebookPen, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CopyView } from '../shared/account-copy'
import { PageRow } from '../side-panel/page-row'
import type { PanelTabProps } from '../side-panel/route'
import { savedWordsLabels as labels } from './labels'
import { type SavedCopy, syncedAgo, useCopy } from './use-copy'

const minute = 60_000

function useMinute(): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const ticking = setInterval(() => setNow(Date.now()), minute)
    return () => clearInterval(ticking)
  }, [])
  return now
}

function lastSynced(copy: CopyView, syncing: boolean, now: number): string {
  if (syncing || copy.sync === 'syncing') return labels.sync.syncing
  return copy.lastSyncedAt === null ? labels.sync.notYet : syncedAgo(copy.lastSyncedAt, now)
}

function SyncItem({ copy, syncing, syncNow }: SavedCopy & { copy: CopyView }) {
  const now = useMinute()
  const note = labels.sync.notes[copy.sync]
  return (
    <Item variant="outline" data-sync={copy.sync}>
      <ItemMedia variant="icon">
        <RefreshCw />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{labels.sync.lastSynced}</ItemTitle>
        <ItemDescription data-last-synced>{lastSynced(copy, syncing, now)}</ItemDescription>
        {copy.unsynced > 0 && (
          <ItemDescription data-waiting>
            {labels.sync.waiting}: {copy.unsynced}
          </ItemDescription>
        )}
        {note && (
          <ItemDescription data-sync-note className="line-clamp-none">
            {note}
          </ItemDescription>
        )}
      </ItemContent>
      <ItemActions>
        <Button variant="outline" size="sm" disabled={syncing} onClick={syncNow}>
          {labels.sync.syncNow}
        </Button>
      </ItemActions>
    </Item>
  )
}

export function SavedWords({ open }: Pick<PanelTabProps, 'open'>) {
  const saved = useCopy()
  const { copy } = saved
  if (!copy) return null
  return (
    <section data-profile="words" className="flex flex-col gap-4 border-t p-4">
      <div className="flex flex-col gap-2">
        <PageRow
          icon={CircleCheck}
          title={labels.knownWords}
          count={copy.knownWords.length}
          onOpen={() => open({ page: 'known-words' })}
        />
        <PageRow
          icon={Contrast}
          title={labels.learning}
          count={copy.learningWords.length}
          onOpen={() => open({ page: 'learning' })}
        />
        <PageRow
          icon={List}
          title={labels.lists}
          count={copy.lists.length}
          onOpen={() => open({ page: 'lists' })}
        />
        <PageRow
          icon={NotebookPen}
          title={labels.notes}
          count={copy.notes.length}
          onOpen={() => open({ page: 'notes' })}
        />
      </div>
      <SyncItem {...saved} copy={copy} />
    </section>
  )
}
