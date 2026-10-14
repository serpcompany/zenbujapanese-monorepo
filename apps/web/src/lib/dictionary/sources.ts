import { type SourceCredit, sourceCredits } from '@zenbu/dictionary-core/sources/credits'

const defaultFrequency = [sourceCredits.jlpt, sourceCredits.tubelex]

export const pageSources = {
  search: [sourceCredits.jmdict, sourceCredits.kanjidic2, ...defaultFrequency],
  word: [
    sourceCredits.jmdict,
    sourceCredits.unidic,
    sourceCredits.kanjidic2,
    ...defaultFrequency,
    sourceCredits.tatoeba
  ],
  browse: [sourceCredits.jmdict, ...defaultFrequency],
  kanji: [sourceCredits.kanjidic2],
  kanjiLevels: [sourceCredits.kanjidic2, sourceCredits.jlptKanji],
  frequency: [
    sourceCredits.jmdict,
    ...defaultFrequency,
    sourceCredits.wikipedia,
    sourceCredits.jiten
  ]
}

export function withShownData(
  base: readonly SourceCredit[],
  shown: {
    kanji: readonly { strokeOrder: unknown; stats: readonly { label: string }[] }[]
    examples?: boolean
  }
): SourceCredit[] {
  const extra = [
    ...(shown.kanji.length > 0 ? [sourceCredits.kanjidic2, sourceCredits.radkfile] : []),
    ...(shown.kanji.some(kanji => kanji.strokeOrder) ? [sourceCredits.kanjivg] : []),
    ...(shown.kanji.length > 0 ? [sourceCredits.kanjium] : []),
    ...(shown.kanji.some(kanji => kanji.stats.some(stat => stat.label === 'JLPT'))
      ? [sourceCredits.jlptKanji]
      : []),
    ...(shown.examples ? [sourceCredits.tatoeba] : [])
  ]
  return [
    ...base,
    ...extra.filter((source, index) => !base.includes(source) && extra.indexOf(source) === index)
  ]
}
