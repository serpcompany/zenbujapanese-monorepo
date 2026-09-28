import { PronounceButton } from './pronounce-button'

/**
 * The reading in katakana with a line over the high morae and a hook where pitch falls, in a
 * capsule with a speaker, as on the app's word card.
 */
export function PitchAccent({
  morae,
  downstep,
  text
}: {
  morae: { mora: string; high: boolean }[]
  /** 0 for flat; otherwise the mora after which pitch falls. */
  downstep: number
  text: string
}) {
  const keyed = morae.map((mora, position) => ({
    ...mora,
    falls: position === downstep - 1,
    key: `${position}`
  }))
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted py-1 pr-3 pl-1">
      <PronounceButton text={text} />
      <span className="sr-only">{text}</span>
      <span lang="ja" className="flex text-lg" aria-hidden>
        {keyed.map(mora => {
          const falls = mora.falls
          return (
            <span
              key={mora.key}
              className={`border-red-500 px-px ${mora.high ? 'border-t-2' : 'border-t-2 border-t-transparent'} ${falls ? 'border-r-2' : ''}`}
            >
              {mora.mora}
            </span>
          )
        })}
      </span>
    </div>
  )
}
