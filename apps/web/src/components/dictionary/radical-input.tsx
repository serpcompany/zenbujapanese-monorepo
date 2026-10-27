'use client'

import { normalizeQuery } from '@zenbu/dictionary-core/search/query'
import { Grid3x3Icon, Undo2Icon } from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { askForSearch } from '@/lib/account/asked-search'
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { Sheet } from './sheet'

type PanelModule = typeof import('./radical-panel')

interface Prepared {
  Panel: PanelModule['RadicalPanel']
  lookup: Awaited<ReturnType<PanelModule['radicalLookup']>>
}

let preparing: Promise<Prepared> | null = null

function preparePanel(): Promise<Prepared> {
  preparing ??= import('./radical-panel')
    .then(async ({ RadicalPanel, radicalLookup }) => ({
      Panel: RadicalPanel,
      lookup: await radicalLookup()
    }))
    .catch((error: unknown) => {
      preparing = null
      throw error
    })
  return preparing
}

const prepareAhead = () => {
  preparePanel().catch(() => undefined)
}

export function RadicalInput({
  locale,
  text,
  credit
}: {
  locale: Locale
  text: Dictionary['searchForm']['radicals']
  credit: ReactNode
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [boxText, setBoxText] = useState('')
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [failed, setFailed] = useState(false)
  const box = () => trigger.current?.form?.elements.namedItem('q') as HTMLInputElement | null
  const load = () => {
    setFailed(false)
    preparePanel().then(setPrepared, () => setFailed(true))
  }
  const show = () => {
    setBoxText(box()?.value ?? '')
    setSelected([])
    setOpen(true)
    if (!prepared) load()
  }
  const toggle = (radical: string) =>
    setSelected(order =>
      order.includes(radical) ? order.filter(id => id !== radical) : [...order, radical]
    )
  const pick = (kanji: string) => {
    const input = box()
    const picked = normalizeQuery(boxText + kanji)
    if (input) input.value = picked
    askForSearch(picked)
    setOpen(false)
  }
  return (
    <>
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        aria-label={text.open}
        aria-haspopup="dialog"
        title={text.open}
        onPointerEnter={prepareAhead}
        onFocus={prepareAhead}
        onClick={show}
      >
        <Grid3x3Icon />
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={text.title}
        wide
        done={text.done}
        actions={
          <Button
            variant="outline"
            disabled={selected.length === 0}
            onClick={() => setSelected(order => order.slice(0, -1))}
          >
            <Undo2Icon />
            {text.undo}
          </Button>
        }
      >
        <div className="flex h-[min(32rem,60dvh)] flex-col gap-3" data-radical-panel>
          {prepared ? (
            <prepared.Panel
              lookup={prepared.lookup}
              selected={selected}
              toggle={toggle}
              boxText={boxText}
              locale={locale}
              text={text}
              pick={pick}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <p>{failed ? text.unavailable : text.loading}</p>
              {failed ? (
                <Button variant="outline" onClick={load}>
                  {text.retry}
                </Button>
              ) : null}
            </div>
          )}
          {credit}
        </div>
      </Sheet>
    </>
  )
}
