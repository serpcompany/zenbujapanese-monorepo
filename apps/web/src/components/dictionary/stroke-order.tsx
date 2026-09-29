'use client'

import type { StrokeOrder as StrokeOrderData } from '@zenbu/dictionary-core/detail/strokes'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PencilLineIcon,
  PlayIcon
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/use-media-query'

// The kanji page's stroke order, ported from the app: KanjiDetailView.swift's `strokeOrderAction`
// (a small bordered button under the glyph) opens KanjiStrokeOrderSheet, whose
// KanjiStrokeOrderView.swift draws the strokes on a dashed grid and animates them one at a time.

/** How long one stroke takes to draw: 8 steps of 60 ms when playing, 12 of 80 ms when stepping. */
const strokeDuration = { play: 480, step: 960 } as const

interface Progress {
  /** Strokes fully drawn. */
  completed: number
  /** How much of the next stroke is drawn, from 0 to 1. */
  active: number
}

/** The button under the glyph, and the sheet it opens: a dialog on wide screens, a drawer on phones. */
export function StrokeOrder({ character, order }: { character: string; order: StrokeOrderData }) {
  const [open, setOpen] = useState(false)
  // Each opening is a new session, so the player starts again from the first stroke, as the
  // app's sheet does.
  const [session, setSession] = useState(0)
  const wide = useMediaQuery('(min-width: 768px)')
  const trigger = (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={`Show stroke order for ${character}`}
      onClick={() => {
        setSession(value => value + 1)
        setOpen(true)
      }}
    >
      <PencilLineIcon />
    </Button>
  )
  // Stays mounted while the sheet animates out; the dialog and drawer unmount it once closed,
  // which also stops its animation.
  const content = <StrokeOrderPlayer key={session} character={character} order={order} />
  if (wide) {
    return (
      <>
        {trigger}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Stroke Order</DialogTitle>
            </DialogHeader>
            {content}
          </DialogContent>
        </Dialog>
      </>
    )
  }
  return (
    <>
      {trigger}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Stroke Order</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4">{content}</div>
        </DrawerContent>
      </Drawer>
    </>
  )
}

/** KanjiStrokeOrderView: the grid, previous / play / next, and which stroke is next. */
export function StrokeOrderPlayer({
  character,
  order
}: {
  character: string
  order: StrokeOrderData
}) {
  const count = order.strokes.length
  const [progress, setProgress] = useState<Progress>({ completed: 0, active: 0 })
  const [mode, setMode] = useState<keyof typeof strokeDuration | null>(null)
  // Each press restarts the animation, even in the same mode.
  const [run, setRun] = useState(0)
  // The animation reads and writes progress between renders, so it's kept in a ref too.
  const current = useRef(progress)
  const update = useCallback((next: Progress) => {
    current.current = next
    setProgress(next)
  }, [])

  useEffect(() => {
    if (!mode) return
    // `run` restarts the animation for a new press in the same mode.
    void run
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const { completed, active } = current.current
      if (completed >= count) {
        setMode(null)
        return
      }
      const drawn = active + (now - last) / strokeDuration[mode]
      last = now
      if (drawn < 1) {
        update({ completed, active: drawn })
        frame = requestAnimationFrame(tick)
        return
      }
      update({ completed: completed + 1, active: 0 })
      if (mode === 'play' && completed + 1 < count) frame = requestAnimationFrame(tick)
      else setMode(null)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [mode, run, count, update])

  const playing = mode === 'play'
  const pause = () => setMode(null)

  function previous() {
    pause()
    const { completed, active } = current.current
    update(
      active > 0 ? { completed, active: 0 } : { completed: Math.max(0, completed - 1), active: 0 }
    )
  }

  function next() {
    pause()
    const { completed } = current.current
    if (completed >= count) return
    update({ completed, active: 0.001 })
    setMode('step')
    setRun(value => value + 1)
  }

  function playOrPause() {
    if (playing) return pause()
    if (current.current.completed >= count) update({ completed: 0, active: 0 })
    setMode('play')
    setRun(value => value + 1)
  }

  const status =
    progress.active > 0
      ? `${progress.completed} strokes complete, drawing stroke ${progress.completed + 1}`
      : `${progress.completed} strokes complete`

  return (
    <div className="flex flex-col items-center gap-4">
      <StrokeGrid character={character} order={order} progress={progress} />
      <span className="sr-only" aria-live="polite">
        {status}
      </span>
      <div className="flex items-center gap-12">
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Previous stroke"
          disabled={progress.completed === 0 && progress.active === 0}
          onClick={previous}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label={playing ? 'Pause stroke order' : 'Play stroke order'}
          onClick={playOrPause}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Next stroke"
          disabled={progress.completed === count}
          onClick={next}
        >
          <ChevronRightIcon />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        Stroke {Math.min(progress.completed + 1, count)} of {count}
      </p>
    </div>
  )
}

/**
 * StrokeDrawingGrid: a dashed frame with center lines; drawn strokes in the foreground color, the
 * rest in the secondary color, the stroke being drawn traced over in the progress color, and a
 * dot where the next stroke starts.
 */
function StrokeGrid({
  character,
  order,
  progress
}: {
  character: string
  order: StrokeOrderData
  progress: Progress
}) {
  const size = order.viewportSize
  const next = order.strokes[progress.completed]
  const line = { vectorEffect: 'non-scaling-stroke' as const }
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Stroke drawing grid for ${character}`}
      className="aspect-square w-full max-w-72 bg-background"
    >
      <g className="stroke-muted-foreground" strokeWidth={1} strokeDasharray="5 4" fill="none">
        <rect x={0} y={0} width={size} height={size} {...line} />
        <line x1={size / 2} y1={0} x2={size / 2} y2={size} {...line} />
        <line x1={0} y1={size / 2} x2={size} y2={size / 2} {...line} />
      </g>
      {/* The app's 7-point strokes on a grid about 350 points wide: 2.2 of the viewport's 109. */}
      <g fill="none" strokeWidth={size * 0.02} strokeLinecap="round" strokeLinejoin="round">
        {order.strokes.map((stroke, index) => (
          <path
            // biome-ignore lint/suspicious/noArrayIndexKey: strokes never reorder; the index is the stroke
            key={index}
            d={stroke.path}
            className={
              index < progress.completed ? 'stroke-foreground' : 'stroke-muted-foreground/50'
            }
          />
        ))}
        {next && progress.active > 0 ? (
          <path
            d={next.path}
            className="stroke-destructive"
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={1 - progress.active}
          />
        ) : null}
      </g>
      {next && progress.active === 0 ? (
        <circle cx={next.start.x} cy={next.start.y} r={size * 0.04} className="fill-destructive" />
      ) : null}
    </svg>
  )
}
