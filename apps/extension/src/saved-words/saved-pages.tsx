import { CircleCheck, Contrast, List, type LucideIcon, NotebookPen } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import type { CopiedWord, CopyView } from '../shared/account-copy'
import { EmptyState } from '../side-panel/empty-tab'
import { PageRow } from '../side-panel/page-row'
import type { PanelPage, PanelPageProps } from '../side-panel/route'
import { CopyUnread } from './copy-unread'
import { savedWordsLabels as labels } from './labels'
import { type SavedCopy, statesIn, useCopy } from './use-copy'
import { type SavedRow, type SavedWordServices, WordRows } from './word-rows'

type PageProps<Kind extends PanelPage['page']> = PanelPageProps<
  Extract<PanelPage, { page: Kind }>
> & { services?: SavedWordServices }

type EmptyText = { title: string; description: string }

function SavedPage({
  kind,
  title,
  children
}: {
  kind: PanelPage['page']
  title: string
  children: ReactNode
}) {
  return (
    <section data-saved-page={kind} className="flex flex-col gap-3 p-4">
      <h2 className="font-heading text-base font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Unread({ read }: { read: Pick<SavedCopy, 'unread' | 'readAgain'> }) {
  return read.unread ? <CopyUnread readAgain={read.readAgain} /> : null
}

function RowsOr({
  rows,
  read,
  icon,
  empty,
  services
}: {
  rows: SavedRow[] | null
  read: Pick<SavedCopy, 'unread' | 'readAgain'>
  icon: LucideIcon
  empty: EmptyText
  services?: SavedWordServices
}) {
  if (rows === null) return <Unread read={read} />
  if (rows.length === 0) return <EmptyState icon={icon} text={empty} className="p-0 py-6" />
  return <WordRows rows={rows} services={services} />
}

const rowsOf = (words: CopiedWord[], state: (item: string) => SavedRow['state']): SavedRow[] =>
  words.map(word => ({ ...word, key: word.item, state: state(word.item) }))

function useRows(rowsFrom: (copy: CopyView) => SavedRow[]) {
  const read = useCopy()
  const { copy } = read
  return { read, rows: useMemo(() => (copy ? rowsFrom(copy) : null), [copy, rowsFrom]) }
}

const knownRows = (copy: CopyView) => rowsOf(copy.knownWords, () => 'known')

const learningRows = (copy: CopyView) => rowsOf(copy.learningWords, () => 'learning')

const noteRows = (copy: CopyView): SavedRow[] => {
  const state = statesIn(copy)
  return copy.notes.map(note => ({
    key: note.id,
    item: note.item,
    headword: note.headword ?? '',
    reading: note.reading ?? '',
    state: state(note.item),
    note: note.text
  }))
}

export function KnownWordsPage({ services }: PageProps<'known-words'>) {
  const { read, rows } = useRows(knownRows)
  return (
    <SavedPage kind="known-words" title={labels.knownWords}>
      <RowsOr
        rows={rows}
        read={read}
        icon={CircleCheck}
        empty={labels.empty.knownWords}
        services={services}
      />
    </SavedPage>
  )
}

export function LearningPage({ services }: PageProps<'learning'>) {
  const { read, rows } = useRows(learningRows)
  return (
    <SavedPage kind="learning" title={labels.learning}>
      <RowsOr
        rows={rows}
        read={read}
        icon={Contrast}
        empty={labels.empty.learning}
        services={services}
      />
    </SavedPage>
  )
}

export function NotesPage({ services }: PageProps<'notes'>) {
  const { read, rows } = useRows(noteRows)
  return (
    <SavedPage kind="notes" title={labels.notes}>
      <RowsOr
        rows={rows}
        read={read}
        icon={NotebookPen}
        empty={labels.empty.notes}
        services={services}
      />
    </SavedPage>
  )
}

export function ListsPage({ open }: PageProps<'lists'>) {
  const read = useCopy()
  const { copy } = read
  return (
    <SavedPage kind="lists" title={labels.lists}>
      {!copy ? (
        <Unread read={read} />
      ) : copy.lists.length === 0 ? (
        <EmptyState icon={List} text={labels.empty.lists} className="p-0 py-6" />
      ) : (
        <div className="flex flex-col gap-2">
          {copy.lists.map(list => (
            <PageRow
              key={list.id}
              icon={List}
              title={list.name}
              count={list.words.length}
              onOpen={() => open({ page: 'list', list: list.id })}
            />
          ))}
        </div>
      )}
    </SavedPage>
  )
}

const newestAdded = (first: { addedAt: string }, second: { addedAt: string }) =>
  second.addedAt.localeCompare(first.addedAt)

export function ListPage({ page, services }: PageProps<'list'>) {
  const read = useCopy()
  const { copy } = read
  const list = copy?.lists.find(each => each.id === page.list)
  const rows = useMemo(
    () => (copy && list ? rowsOf([...list.words].sort(newestAdded), statesIn(copy)) : null),
    [copy, list]
  )
  if (!copy) return <Unread read={read} />
  if (!list) return <EmptyState icon={List} text={labels.empty.listGone} className="h-full" />
  return (
    <SavedPage kind="list" title={list.name}>
      <RowsOr rows={rows} read={read} icon={List} empty={labels.empty.list} services={services} />
    </SavedPage>
  )
}
