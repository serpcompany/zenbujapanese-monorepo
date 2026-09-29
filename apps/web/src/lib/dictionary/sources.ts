// Credits for the data dictionary pages show, matching the app's Credits & Attributions
// (apps/ios/Modules/Sources/SearchExperience/CreditsView.swift) and docs/data-sources.md.
// EDRDG's licence requires its acknowledgement, with links, on every page that shows its data.

export interface Source {
  name: string
  url: string
  credit: string
  license: { name: string; url?: string }
}

const ccBySa4 = { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' }
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
    license: { name: 'BSD-3-Clause' }
  },
  jiten: {
    name: 'Jiten',
    url: 'https://jiten.moe/frequency-dictionaries',
    credit: 'Anime frequency data by Jiten (jiten.moe).',
    license: ccBySa4
  },
  tatoeba: {
    name: 'Tatoeba',
    url: 'https://tatoeba.org/',
    credit: 'Example sentences by Tatoeba contributors.',
    license: { name: 'CC BY 2.0 FR', url: 'https://creativecommons.org/licenses/by/2.0/fr/' }
  }
} satisfies Record<string, Source>

const frequency = [sources.jlpt, sources.tubelex, sources.jiten]

/** What each kind of page can show. */
export const pageSources = {
  search: [sources.jmdict, sources.kanjidic2, ...frequency],
  word: [sources.jmdict, sources.unidic, sources.kanjidic2, ...frequency, sources.tatoeba],
  kanji: [sources.kanjidic2, sources.radkfile, sources.kanjium, sources.jmdict]
}
