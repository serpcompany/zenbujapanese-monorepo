import { Button } from '@zenbu/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@zenbu/ui/components/dropdown-menu'
import { PauseIcon, PlayIcon, Repeat1Icon, SkipBackIcon, SkipForwardIcon } from 'lucide-react'
import { playerCaptionLabels as player } from '../player-captions/labels'
import { type LineControls, type LineView, speeds } from '../player-captions/line-controls'
import { videoTabLabels } from './labels'

const ghostClass =
  'hover:bg-(--player-hover) aria-expanded:bg-(--player-hover) dark:hover:bg-(--player-hover)'

const pressedClass = `${ghostClass} aria-pressed:bg-(--player-hover) aria-pressed:text-blue-600 dark:aria-pressed:text-blue-400`

function Speed({ rate, off, choose }: { rate: number; off: boolean; choose(rate: number): void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={off}
        render={
          <Button
            variant="ghost"
            size="sm"
            className={`min-w-9.5 px-1.5 text-xs tabular-nums ${ghostClass}`}
            aria-label={player.speedMenu(rate)}
          />
        }
      >
        {player.speed(rate)}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto" align="end">
        <DropdownMenuRadioGroup onValueChange={value => choose(Number(value))} value={String(rate)}>
          {speeds.map(each => (
            <DropdownMenuRadioItem closeOnClick value={String(each)} key={each}>
              {player.speed(each)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ControlBar({
  controls,
  view,
  time
}: {
  controls: LineControls
  view: LineView
  time: number
}) {
  const off = !view.ready || view.ad
  const step = (label: string, Icon: typeof SkipBackIcon, act: () => void) => (
    <Button
      variant="ghost"
      size="icon-sm"
      className={ghostClass}
      disabled={off}
      aria-label={label}
      onClick={act}
    >
      <Icon />
    </Button>
  )
  return (
    <div
      data-control-bar
      role="toolbar"
      aria-label={videoTabLabels.controls}
      className="muted-surface grid h-11.5 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center bg-muted px-2.5"
    >
      <span data-clock className="truncate text-[11px] text-muted-foreground tabular-nums">
        {videoTabLabels.clock(time)}
      </span>
      <div className="flex items-center gap-4.5">
        {step(player.previousLine, SkipBackIcon, () => controls.previous())}
        <Button
          size="icon-lg"
          className="rounded-full"
          disabled={off}
          aria-label={view.playing ? player.pause : player.play}
          onClick={() => controls.togglePlay()}
        >
          {view.playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
        {step(player.nextLine, SkipForwardIcon, () => controls.next())}
      </div>
      <div className="flex items-center gap-0.5 justify-self-end">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={off}
          aria-label={player.repeatLine}
          aria-pressed={view.repeating}
          className={pressedClass}
          onClick={() => controls.toggleRepeat()}
        >
          <Repeat1Icon />
        </Button>
        <Speed rate={view.rate} off={off} choose={rate => controls.setRate(rate)} />
      </div>
    </div>
  )
}
