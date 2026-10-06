export interface Source {
  name: string
  url: string
  credit: string
  license: { name: string; url?: string }
  notice?: string
}

const ccBySa4 = { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' }
const bsd3 = { name: 'BSD-3-Clause', url: 'https://opensource.org/license/bsd-3-clause' }
const edrdgLicence = {
  name: 'EDRDG licence, CC BY-SA 4.0',
  url: 'https://www.edrdg.org/edrdg/licence.html'
}

export const sources = {
  jmdict: {
    name: 'JMdict',
    url: 'https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project',
    credit: 'Dictionary data by the Electronic Dictionary Research and Development Group.',
    license: edrdgLicence
  },
  kanjidic2: {
    name: 'KANJIDIC2',
    url: 'https://www.edrdg.org/wiki/index.php/KANJIDIC_Project',
    credit: 'Kanji data by the Electronic Dictionary Research and Development Group.',
    license: edrdgLicence
  },
  radkfile: {
    name: 'RADKFILE',
    url: 'https://www.edrdg.org/krad/kradinf.html',
    credit: 'Radical data by the Electronic Dictionary Research and Development Group.',
    license: edrdgLicence
  },
  kanjivg: {
    name: 'KanjiVG',
    url: 'https://kanjivg.tagaini.net/',
    credit: 'Kanji stroke data by Ulrich Apel.',
    license: { name: 'CC BY-SA 3.0', url: 'https://creativecommons.org/licenses/by-sa/3.0/' }
  },
  kanjium: {
    name: 'Kanjium',
    url: 'https://github.com/mifunetoshiro/kanjium',
    credit: 'Kanji structure data by Uros O.',
    license: ccBySa4
  },
  unidic: {
    name: 'UniDic',
    url: 'https://clrd.ninjal.ac.jp/unidic/',
    credit: 'Pitch-accent data by the National Institute for Japanese Language and Linguistics.',
    license: { name: 'BSD' }
  },
  jlpt: {
    name: 'JLPT levels',
    url: 'https://github.com/stephenmk/yomitan-jlpt-vocab',
    credit:
      "Unofficial level estimates from Jonathan Waller's lists, matched to JMdict by stephenmk.",
    license: ccBySa4
  },
  tubelex: {
    name: 'TUBELEX',
    url: 'https://github.com/naist-nlp/tubelex',
    credit: 'YouTube frequency data by Adam Nohejl and contributors.',
    license: bsd3
  },
  wikipedia: {
    name: 'Wikipedia Word Frequency Clean',
    url: 'https://github.com/adno/wikipedia-word-frequency-clean',
    credit: 'Wikipedia frequency data by Adam Nohejl and contributors.',
    license: bsd3
  },
  jiten: {
    name: 'Jiten',
    url: 'https://jiten.moe/frequency-dictionaries',
    credit:
      'TV and movie, anime, manga, novel, visual novel, and video game frequency data by Jiten (jiten.moe), modified.',
    license: ccBySa4,
    notice:
      'The rankings from Jiten on this page are adapted from its data, and are shared under the same licence, CC BY-SA 4.0.'
  },
  tatoeba: {
    name: 'Tatoeba',
    url: 'https://tatoeba.org/',
    credit: 'Example sentences by Tatoeba contributors.',
    license: { name: 'CC BY 2.0 FR', url: 'https://creativecommons.org/licenses/by/2.0/fr/' }
  }
} satisfies Record<string, Source>

const defaultFrequency = [sources.jlpt, sources.tubelex]

export const pageSources = {
  search: [sources.jmdict, sources.kanjidic2, ...defaultFrequency],
  word: [sources.jmdict, sources.unidic, sources.kanjidic2, ...defaultFrequency, sources.tatoeba],
  browse: [sources.jmdict, ...defaultFrequency],
  kanji: [sources.kanjidic2],
  frequency: [sources.jmdict, ...defaultFrequency, sources.wikipedia, sources.jiten]
}

export function withShownData(
  base: readonly Source[],
  shown: { kanji: readonly { strokeOrder: unknown }[]; examples?: boolean }
): Source[] {
  const extra = [
    ...(shown.kanji.length > 0 ? [sources.kanjidic2, sources.radkfile] : []),
    ...(shown.kanji.some(kanji => kanji.strokeOrder) ? [sources.kanjivg] : []),
    ...(shown.kanji.length > 0 ? [sources.kanjium] : []),
    ...(shown.examples ? [sources.tatoeba] : [])
  ]
  return [
    ...base,
    ...extra.filter((source, index) => !base.includes(source) && extra.indexOf(source) === index)
  ]
}
