const creditClients = ['app', 'website', 'extension'] as const

type CreditClient = (typeof creditClients)[number]

interface SourceLicense {
  name: string
  url?: string
}

export interface SourceCredit {
  id: string
  name: string
  url: string
  credit: string
  license: SourceLicense
  notice?: string
  clients: readonly CreditClient[]
}

interface CreditsShown {
  conversionNotice: string
  credits: SourceCredit[]
}

const everyClient: readonly CreditClient[] = creditClients
const appAndWebsite: readonly CreditClient[] = ['app', 'website']
const ccBySa4 = { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' }
const bsd3 = { name: 'BSD-3-Clause', url: 'https://opensource.org/license/bsd-3-clause' }
const edrdgLicence = {
  name: 'EDRDG licence, CC BY-SA 4.0',
  url: 'https://www.edrdg.org/edrdg/licence.html'
}

const conversionNotice =
  'Zenbu converts each source into its own formats and shares converted Creative Commons data under the same licence.'

export const sourceCredits = {
  jmdict: {
    id: 'jmdict',
    name: 'JMdict',
    url: 'https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project',
    credit: 'Dictionary data by the Electronic Dictionary Research and Development Group.',
    license: edrdgLicence,
    clients: everyClient
  },
  kanjidic2: {
    id: 'kanjidic2',
    name: 'KANJIDIC2',
    url: 'https://www.edrdg.org/wiki/index.php/KANJIDIC_Project',
    credit: 'Kanji data by the Electronic Dictionary Research and Development Group.',
    license: edrdgLicence,
    clients: everyClient
  },
  radkfile: {
    id: 'radkfile',
    name: 'RADKFILE',
    url: 'https://www.edrdg.org/krad/kradinf.html',
    credit: 'Radical data by the Electronic Dictionary Research and Development Group.',
    license: edrdgLicence,
    clients: everyClient
  },
  kanjivg: {
    id: 'kanjivg',
    name: 'KanjiVG',
    url: 'https://kanjivg.tagaini.net/',
    credit: 'Kanji stroke data by Ulrich Apel.',
    license: { name: 'CC BY-SA 3.0', url: 'https://creativecommons.org/licenses/by-sa/3.0/' },
    clients: everyClient
  },
  kanjium: {
    id: 'kanjium',
    name: 'Kanjium',
    url: 'https://github.com/mifunetoshiro/kanjium',
    credit: 'Kanji structure data by Uros O.',
    license: ccBySa4,
    clients: everyClient
  },
  unidic: {
    id: 'unidic',
    name: 'UniDic',
    url: 'https://clrd.ninjal.ac.jp/unidic/',
    credit: 'Pitch-accent data by the National Institute for Japanese Language and Linguistics.',
    license: { name: 'BSD' },
    clients: everyClient
  },
  jlpt: {
    id: 'jlpt',
    name: 'JLPT vocabulary lists',
    url: 'https://github.com/stephenmk/yomitan-jlpt-vocab',
    credit:
      "Unofficial level estimates from Jonathan Waller's lists, matched to JMdict by stephenmk.",
    license: ccBySa4,
    clients: everyClient
  },
  jlptKanji: {
    id: 'jlptKanji',
    name: 'JLPT kanji lists',
    url: 'https://web.archive.org/web/20200806005029/http://www.tanos.co.uk/jlpt/jlpt5/kanji/',
    credit: "Unofficial level estimates from Jonathan Waller's JLPT kanji lists (tanos.co.uk).",
    license: { name: 'CC BY' },
    clients: everyClient
  },
  tubelex: {
    id: 'tubelex',
    name: 'TUBELEX',
    url: 'https://github.com/naist-nlp/tubelex',
    credit: 'YouTube frequency data by Adam Nohejl and contributors.',
    license: bsd3,
    clients: everyClient
  },
  wikipedia: {
    id: 'wikipedia',
    name: 'Wikipedia Word Frequency Clean',
    url: 'https://github.com/adno/wikipedia-word-frequency-clean',
    credit: 'Wikipedia frequency data by Adam Nohejl and contributors.',
    license: bsd3,
    clients: appAndWebsite
  },
  jiten: {
    id: 'jiten',
    name: 'Jiten',
    url: 'https://jiten.moe/frequency-dictionaries',
    credit:
      'TV and movie, anime, manga, novel, visual novel, and video game frequency data by Jiten (jiten.moe), modified.',
    license: ccBySa4,
    notice:
      'The rankings from Jiten are adapted from its data, and are shared under the same licence, CC BY-SA 4.0.',
    clients: appAndWebsite
  },
  sudachi: {
    id: 'sudachi',
    name: 'Sudachi',
    url: 'https://github.com/WorksApplications/SudachiDict',
    credit: 'Japanese word analysis by Sudachi.rs and SudachiDict.',
    license: { name: 'Apache-2.0 · BSD-3-Clause · MIT' },
    clients: appAndWebsite
  },
  kuromoji: {
    id: 'kuromoji',
    name: 'Kuromoji',
    url: 'https://github.com/takuyaa/kuromoji.js',
    credit: 'Interactive text parsing ported from kuromoji.js, with MeCab IPADIC.',
    license: { name: 'Apache-2.0 · IPADIC' },
    clients: everyClient
  },
  tatoeba: {
    id: 'tatoeba',
    name: 'Tatoeba',
    url: 'https://tatoeba.org/en/',
    credit: 'Example sentences by Tatoeba contributors.',
    license: { name: 'CC BY 2.0 FR', url: 'https://creativecommons.org/licenses/by/2.0/fr/' },
    clients: everyClient
  },
  dakanji: {
    id: 'dakanji',
    name: 'DaKanji',
    url: 'https://github.com/dariyooo/DaKanji-Single-Kanji-Recognition',
    credit: 'Handwriting recognition by Dario Radmann and contributors.',
    license: { name: 'MIT' },
    clients: ['app']
  }
} satisfies Record<string, SourceCredit>

const everyCredit: readonly SourceCredit[] = Object.values(sourceCredits)

const isCreditClient = (client: string): client is CreditClient =>
  (creditClients as readonly string[]).includes(client)

export function creditsShownBy(client: string): CreditsShown {
  if (!isCreditClient(client)) throw new Error(`No client is named ${client}`)
  return {
    conversionNotice,
    credits: everyCredit.filter(credit => credit.clients.includes(client))
  }
}
