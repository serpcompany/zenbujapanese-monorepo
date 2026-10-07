export interface WordCardSource {
  name: string
  supplies: string
  license: string
  url: string
  notice: string
}

const ccBySa4 = 'CC BY-SA 4.0'
const bsd3 = 'BSD-3-Clause'

export const wordCardSources: readonly WordCardSource[] = [
  {
    name: 'JMdict and KANJIDIC2',
    supplies: 'headwords, readings, meanings, parts of speech, and the kanji readings in furigana',
    license: 'EDRDG licence (CC BY-SA 4.0)',
    url: 'https://www.edrdg.org/edrdg/licence.html',
    notice: 'EDRDG-ATTRIBUTION.md'
  },
  {
    name: 'UniDic',
    supplies: 'pitch accent, and the accent types two-part compounds are estimated from',
    license: 'BSD',
    url: 'https://clrd.ninjal.ac.jp/unidic/',
    notice: 'UNIDIC-NEW-BSD.txt'
  },
  {
    name: 'JLPT vocabulary lists',
    supplies: "JLPT levels, Jonathan Waller's lists matched to JMdict by stephenmk",
    license: ccBySa4,
    url: 'https://github.com/stephenmk/yomitan-jlpt-vocab',
    notice: 'JLPT-VOCABULARY-CC-BY-SA-4.0.txt'
  },
  {
    name: 'TUBELEX',
    supplies: 'YouTube ranks',
    license: bsd3,
    url: 'https://github.com/naist-nlp/tubelex',
    notice: 'TUBELEX-BSD-3-CLAUSE.txt'
  },
  {
    name: 'Wikipedia Word Frequency Clean',
    supplies: 'Wikipedia ranks',
    license: bsd3,
    url: 'https://github.com/adno/wikipedia-word-frequency-clean',
    notice: 'WIKIPEDIA-FREQUENCY-BSD-3-CLAUSE.txt'
  },
  {
    name: 'Jiten',
    supplies: 'TV & Movies, Anime, Manga, Novels, Visual Novels, and Games ranks, adapted',
    license: ccBySa4,
    url: 'https://jiten.moe/frequency-dictionaries',
    notice: 'JITEN-NOTICE.txt'
  }
]
