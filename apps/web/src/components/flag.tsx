import { cn } from '@/lib/utils'

const tidy = (value: number) => Math.round(value * 100) / 100
const stripe = 20 / 13
const unionHeight = tidy(stripe * 7)
const starRows = Array.from({ length: 9 }, (_, row) => row)

function UnitedStatesFlag() {
  return (
    <>
      <rect width="30" height="20" fill="#B22234" />
      {[1, 3, 5, 7, 9, 11].map(row => (
        <rect key={row} y={tidy(row * stripe)} width="30" height={tidy(stripe)} fill="#FFFFFF" />
      ))}
      <rect width="12" height={unionHeight} fill="#3C3B6E" />
      {starRows.flatMap(row =>
        (row % 2 === 0 ? [1, 3, 5, 7, 9, 11] : [2, 4, 6, 8, 10]).map(column => (
          <circle
            key={`${row}-${column}`}
            cx={column}
            cy={tidy(((row + 1) * unionHeight) / 10)}
            r="0.35"
            fill="#FFFFFF"
          />
        ))
      )}
    </>
  )
}

function JapanFlag() {
  return (
    <>
      <rect width="30" height="20" fill="#FFFFFF" />
      <circle cx="15" cy="10" r="6" fill="#BC002D" />
    </>
  )
}

const flags: Readonly<Record<string, () => React.JSX.Element>> = {
  US: UnitedStatesFlag,
  JP: JapanFlag
}

export function Flag({ region, className }: { region: string; className?: string }) {
  const Drawing = flags[region]
  if (!Drawing) return null
  return (
    <svg
      viewBox="0 0 30 20"
      aria-hidden="true"
      data-flag={region}
      className={cn(
        'size-auto h-3.5 w-[21px] shrink-0 rounded-[2px] ring-1 ring-border',
        className
      )}
    >
      <Drawing />
    </svg>
  )
}
