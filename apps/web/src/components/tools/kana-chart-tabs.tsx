'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toKatakana } from '@/lib/tools/kana'
import type { KanaChartTab, KanaRow } from '@/lib/tools/reference'
import { kanaChartTabs } from '@/lib/tools/reference'
import { cn } from '@/lib/utils'

export type KanaChartShows = 'both scripts' | 'other spellings'

function KanaTile({ row, shows }: { row: KanaRow; shows: KanaChartShows }) {
  return (
    <li className="flex flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-2 text-center">
      <span className="text-xl leading-tight">
        {row.kana}
        {shows === 'both scripts' ? (
          <span className="ml-1 text-muted-foreground">{toKatakana(row.kana)}</span>
        ) : null}
      </span>
      <span lang="ja-Latn" className="font-mono text-xs text-muted-foreground">
        {row.romaji}
      </span>
      {shows === 'other spellings' && row.otherSpellings.length ? (
        <span lang="en" className="text-xs text-muted-foreground">
          or <span lang="ja-Latn">{row.otherSpellings.join(', ')}</span>
        </span>
      ) : null}
    </li>
  )
}

function KanaGrid({ tab, shows }: { tab: KanaChartTab; shows: KanaChartShows }) {
  return (
    <ul
      aria-label={`${tab.label} kana`}
      lang="ja"
      className={cn('grid gap-1.5', tab.columns === 5 ? 'grid-cols-5' : 'grid-cols-3')}
    >
      {tab.cells.map(cell =>
        cell.row ? (
          <KanaTile key={cell.position} row={cell.row} shows={shows} />
        ) : (
          <li key={cell.position} aria-hidden="true" />
        )
      )}
    </ul>
  )
}

export function KanaChartTabs({ shows }: { shows: KanaChartShows }) {
  return (
    <Tabs defaultValue={kanaChartTabs[0].id} className="max-w-3xl gap-4">
      <TabsList aria-label="Kana chart">
        {kanaChartTabs.map(tab => (
          <TabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {kanaChartTabs.map(tab => (
        <TabsContent
          key={tab.id}
          value={tab.id}
          keepMounted
          className="flex flex-col gap-3 text-base"
        >
          <p className="text-[15px] text-muted-foreground">{tab.note}</p>
          <KanaGrid tab={tab} shows={shows} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
