import { type Caption, japaneseCaptions, type TimedLine, translationSentences } from './lines'
import { pairedCaptions } from './pairing'

const soundDescriptions = /[\p{Zs}\t]*（[^（）]*）[\p{Zs}\t]*/gu

export function netflixCaptions(
  japanese: readonly TimedLine[],
  english: readonly TimedLine[] | null
): Caption[] {
  const captions = japaneseCaptions(
    japanese.map(line => ({ ...line, text: line.text.replace(soundDescriptions, ' ') }))
  )
  return english ? pairedCaptions(captions, translationSentences(english)) : captions
}
