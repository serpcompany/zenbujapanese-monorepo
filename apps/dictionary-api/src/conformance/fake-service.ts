import type { DictionaryService } from '../service'

export const info = {
  build: 'e13452e70d34-test',
  artifact: { name: 'LanguageReferenceData.sqlite3', sha256: 'e13452e70d34' },
  languageData: {
    release: '2026.10.1',
    file: 'LanguageReferenceData.sqlite3',
    sha256: 'e13452e70d34'
  },
  features: { sentenceSearch: true }
}

export function fakeService(overrides: Partial<DictionaryService> = {}): DictionaryService {
  return {
    info: async () => info,
    search: async query => ({ screen: { state: 'noResults', query } }),
    searchExamples: async () => null,
    word: async entSeq => (entSeq === 1358280 ? ({ slug: '食べる' } as never) : null),
    wordExamples: async () => ({ rows: [], slugs: {} }),
    formExamples: async () => ({ rows: [], listed: 0, slugs: {} }),
    kanji: async character => (character === '要' ? ({ slugs: {} } as never) : null),
    wordSitemaps: async () => [],
    sitemapWords: async () => null,
    retired: async () => ({}),
    browseSummary: async () => ({}) as never,
    kanaIndex: async script => ({ script, total: 0, initials: [] }),
    kanaInitial: async () => null,
    kanaWords: async () => null,
    browseCategories: async () => ({ categories: [] }),
    categoryWords: async slug => (slug === 'nouns' ? ({ words: [] } as never) : null),
    rankedLists: async () => ({ lists: [], jlpt: [] }),
    rankedWords: async () => null,
    kanjiHub: async () => ({ lists: [], jlpt: [], strokes: [] }),
    kanjiList: async () => null,
    browseSitemap: async () => ({
      kana: [],
      categories: [],
      rankedLists: [],
      jlptLists: [],
      kanjiLists: []
    }),
    wordCards: async () => [],
    segment: async () => [],
    ...overrides
  }
}
