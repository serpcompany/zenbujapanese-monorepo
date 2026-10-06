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

const strokeDurationMs = { play: 8 * 60, step: 12 * 80 } as const
const appGridPoints = 350
const appStrokeWidthPoints = 7
const strokeWidthPerSide = appStrokeWidthPoints / appGridPoints
const startDotRadiusPerSide = 0.04

interface Progress {
  completed: number
  active: number
}

export function StrokeOrder({ character, order }: { character: string; order: StrokeOrderData }) {
  const [open, setOpen] = useState(false)
  const [opening, setOpening] = useState(0)
  const wide = useMediaQuery('(min-width: 768px)')
  const trigger = (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={`Show stroke order for ${character}`}
      onClick={() => {
        setOpening(value => value + 1)
        setOpen(true)
      }}
    >
      <PencilLineIcon />
    </Button>
  )
  const content = <StrokeOrderPlayer key={opening} character={character} order={order} />
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

function StrokeOrderPlayer({ character, order }: { character: string; order: StrokeOrderData }) {
  const count = order.strokes.length
  const [progress, setProgress] = useState<Progress>({ completed: 0, active: 0 })
  const [mode, setMode] = useState<keyof typeof strokeDurationMs | null>(null)
  const [presses, setPresses] = useState(0)
  const latestProgress = useRef(progress)
  const update = useCallback((next: Progress) => {
    latestProgress.current = next
    setProgress(next)
  }, [])

  useEffect(() => {
    if (!mode) return
    void presses
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const { completed, active } = latestProgress.current
      if (completed >= count) {
        setMode(null)
        return
      }
      const drawn = active + (now - last) / strokeDurationMs[mode]
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
  }, [mode, presses, count, update])

  const playing = mode === 'play'
  const pause = () => setMode(null)

  function previous() {
    pause()
    const { completed, active } = latestProgress.current
    update(
      active > 0 ? { completed, active: 0 } : { completed: Math.max(0, completed - 1), active: 0 }
    )
  }

  function next() {
    pause()
    const { completed } = latestProgress.current
    if (completed >= count) return
    update({ completed, active: 0.001 })
    setMode('step')
    setPresses(value => value + 1)
  }

  function playOrPause() {
    if (playing) return pause()
    if (latestProgress.current.completed >= count) update({ completed: 0, active: 0 })
    setMode('play')
    setPresses(value => value + 1)
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
  const numberedStrokes = order.strokes.map((stroke, index) => ({
    stroke,
    strokeNumber: index + 1
  }))
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
      <g
        fill="none"
        strokeWidth={size * strokeWidthPerSide}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {numberedStrokes.map(({ stroke, strokeNumber }) => (
          <path
            key={strokeNumber}
            d={stroke.path}
            className={
              strokeNumber <= progress.completed
                ? 'stroke-foreground'
                : 'stroke-muted-foreground/50'
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
        <circle
          cx={next.start.x}
          cy={next.start.y}
          r={size * startDotRadiusPerSide}
          className="fill-destructive"
        />
      ) : null}
    </svg>
  )
}
