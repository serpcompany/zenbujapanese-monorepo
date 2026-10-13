import { sourceCredits } from '../sources/credits'

export interface WordCardSource {
  name: string
  supplies: string
  license: string
  url: string
  notice: string
}

const { jmdict, kanjidic2, unidic, jlpt, tubelex, wikipedia, jiten } = sourceCredits

export const wordCardLicense = {
  name: jiten.license.name,
  url: jiten.license.url,
  statement:
    'The cards adapt CC BY-SA 4.0 data (JMdict and KANJIDIC2, the JLPT vocabulary lists, and Jiten), so they are shared under CC BY-SA 4.0, with each source credited and its notice included.'
}

export const wordCardSources: readonly WordCardSource[] = [
  {
    name: `${jmdict.name} and ${kanjidic2.name}`,
    supplies: 'headwords, readings, meanings, parts of speech, and the kanji readings in furigana',
    license: jmdict.license.name,
    url: jmdict.license.url,
    notice: 'EDRDG-ATTRIBUTION.md'
  },
  {
    name: unidic.name,
    supplies: 'pitch accent, and the accent types two-part compounds are estimated from',
    license: unidic.license.name,
    url: unidic.url,
    notice: 'UNIDIC-NEW-BSD.txt'
  },
  {
    name: jlpt.name,
    supplies: "JLPT levels, Jonathan Waller's lists matched to JMdict by stephenmk",
    license: jlpt.license.name,
    url: jlpt.url,
    notice: 'JLPT-VOCABULARY-CC-BY-SA-4.0.txt'
  },
  {
    name: tubelex.name,
    supplies: 'YouTube ranks',
    license: tubelex.license.name,
    url: tubelex.url,
    notice: 'TUBELEX-BSD-3-CLAUSE.txt'
  },
  {
    name: wikipedia.name,
    supplies: 'Wikipedia ranks',
    license: wikipedia.license.name,
    url: wikipedia.url,
    notice: 'WIKIPEDIA-FREQUENCY-BSD-3-CLAUSE.txt'
  },
  {
    name: jiten.name,
    supplies: 'TV & Movies, Anime, Manga, Novels, Visual Novels, and Games ranks, adapted',
    license: jiten.license.name,
    url: jiten.url,
    notice: 'JITEN-NOTICE.txt'
  }
]
