import type { CSSProperties, ReactNode } from 'react'
import { meaningGapProperty, meaningGapRem } from '../shared/meaning-aid'
import type { Settings } from '../shared/settings'

const onOff = (on: boolean) => (on ? 'on' : 'off')

const meaningGapStyle = { [meaningGapProperty]: meaningGapRem } as CSSProperties

export function ReadingAids({
  settings,
  className,
  children
}: {
  settings: Settings
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={className}
      style={meaningGapStyle}
      data-reading-aids
      data-furigana={onOff(settings['readingAids.furigana'])}
      data-romaji={onOff(settings['readingAids.romaji'])}
      data-word-meanings={onOff(settings['readingAids.wordMeanings'])}
      data-translations={onOff(settings['readingAids.translations'])}
    >
      {children}
    </div>
  )
}
