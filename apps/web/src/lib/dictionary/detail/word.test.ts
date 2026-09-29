import { describe, expect, test } from 'vitest'
import { fixtureWordRows } from '@/lib/dictionary/fixtures'
import { partOfSpeechPhrase } from './part-of-speech'
import type { EntryRow, WordRows } from './rows'
import { alternativeKanji, primaryKanji, wordDetail, wordSummary } from './word'

// Expected values follow DictionaryEntry.swift, PartOfSpeechFormatter.swift, and
// WordDetailView.swift, over real entries from the app's bundled data (the fixtures).

function rows(entSeq: number): WordRows {
  const found = fixtureWordRows.find(candidate => candidate.entry.entSeq === entSeq)
  if (!found) throw new Error(`No fixture for ${entSeq}`)
  return found
}

describe('partOfSpeechPhrase (PartOfSpeechFormatter.phrase)', () => {
  test('names one word class, then its modifiers', () => {
    expect(partOfSpeechPhrase(['godanVerb', 'intransitive'])).toBe('Godan verb (intransitive)')
    expect(partOfSpeechPhrase(['noun', 'takesSuru', 'transitive'])).toBe(
      'Noun · する verb (transitive)'
    )
    expect(partOfSpeechPhrase(['adverb', 'adverbTo'])).toBe('Adverb (と)')
    expect(partOfSpeechPhrase(['noun', 'noAdjective'])).toBe('Noun (の)')
    expect(partOfSpeechPhrase(['verb', 'godanVerb'])).toBe('Godan verb')
    expect(partOfSpeechPhrase(['transitive', 'intransitive'])).toBe(
      'Verb (transitive or intransitive)'
    )
  })

  test('leaves out unknown and unclassified parts', () => {
    expect(partOfSpeechPhrase(['unclassified'])).toBe('')
    expect(partOfSpeechPhrase(['constructor', 'toString'])).toBe('')
  })
})

describe('primaryKanji (DictionaryEntry.primaryKanji)', () => {
  test('lists each CJK unified ideograph once, in order', () => {
    expect(primaryKanji('要る')).toEqual(['要'])
    expect(primaryKanji('日本語の日')).toEqual(['日', '本', '語'])
    expect(primaryKanji('いる')).toEqual([])
  })

  test('leaves out 々, 〇, and 〻, which are outside U+3400–U+9FFF', () => {
    expect(primaryKanji('人々')).toEqual(['人'])
    expect(primaryKanji('時々')).toEqual(['時'])
    expect(primaryKanji('〇〻')).toEqual([])
  })
})

describe('alternativeKanji (DictionaryEntry.alternativeKanji)', () => {
  test('lists kanji from the other written forms that the headword lacks', () => {
    // 炒る (1391500), also written 煎る and 熬る.
    expect(alternativeKanji(rows(1391500).entry)).toEqual(['煎', '熬'])
    // いる (1577980), rarely written 居る.
    expect(alternativeKanji(rows(1577980).entry)).toEqual(['居'])
  })

  test('includes Search only forms, as the app does', () => {
    // 要項 (1546750) has the Search only form 要頂.
    expect(alternativeKanji(rows(1546750).entry)).toEqual(['頂'])
  })
})

describe('wordDetail', () => {
  test('要る (1546640)', () => {
    const detail = wordDetail(rows(1546640))
    expect(detail.ruby).toEqual([{ text: '要', reading: 'い' }, { text: 'る' }])
    expect(detail.partOfSpeech).toBe('Godan verb (intransitive)')
    expect(detail.pitch).toEqual({
      morae: [
        { mora: 'イ', high: false },
        { mora: 'ル', high: true }
      ],
      downstep: 0,
      particleHigh: true
    })
    expect(detail.senses).toEqual([
      {
        number: 1,
        meaning: 'to be needed, to be necessary, to be required, to be wanted, to need, to want',
        notes: ['Usually written in kana']
      }
    ])
    expect(detail.frequencyRows).toEqual([
      { source: 'JLPT', value: 'N5', tier: 'veryCommon', spokenTier: null },
      { source: 'YouTube', value: '949', tier: 'veryCommon', spokenTier: 'very common' }
    ])
    expect(detail.kanji).toEqual([{ character: '要', meaning: 'need, main point' }])
    expect(detail.alternatives).toEqual([])
    expect(detail.alternativeKanji).toEqual([])
    expect(detail.related).toEqual([])
    expect(detail.shareText).toBe(
      '要る【いる】\n1. to be needed, to be necessary, to be required, to be wanted, to need, to want'
    )
    // Example furigana goes over the kanji only (#479 review item 11), and the page's word links
    // to itself.
    const pageWord = detail.examples
      .flatMap(example => example.tokens)
      .find(token => token.isPageWord && token.text === '要る')
    expect(pageWord).toEqual({
      text: '要る',
      ruby: [{ text: '要', reading: 'い' }, { text: 'る' }],
      link: { entSeq: 1546640 },
      isPageWord: true
    })
    expect(detail.exampleCount?.listed).toBe(detail.examples.length)
  })

  test('いる (1577980): the first sense’s word class, kana only, a rare written form', () => {
    const detail = wordDetail(rows(1577980))
    // Not "Ichidan verb (intransitive) · Auxiliary verb", which unions every sense.
    expect(detail.partOfSpeech).toBe('Ichidan verb (intransitive)')
    expect(detail.ruby).toEqual([{ text: 'いる' }])
    expect(detail.kanji).toEqual([])
    expect(detail.alternatives).toEqual([
      { value: '居る', kind: 'written', labels: ['Rare'], kanji: '居' }
    ])
    expect(detail.alternativeKanji).toEqual([{ character: '居', meaning: 'reside, to be' }])
    expect(detail.related).toEqual([
      {
        headword: '有る',
        reading: 'ある',
        ruby: [{ text: '有', reading: 'あ' }, { text: 'る' }],
        relation: 'See also',
        summary: 'to be, to exist, to live',
        entSeq: 1296400
      }
    ])
    expect(detail.frequencyRows).toEqual([
      { source: 'JLPT', value: 'N5', tier: 'veryCommon', spokenTier: null },
      { source: 'YouTube', value: 'No rank', tier: null, spokenTier: null }
    ])
    // A kana headword shares without a reading.
    expect(detail.shareText.split('\n')[0]).toBe('いる')
  })

  test('leaves out Search only forms and repeats from the alternatives', () => {
    // 要項 (1546750): 要頂 is Search only.
    expect(wordDetail(rows(1546750)).alternatives).toEqual([])
    // 炒る (1391500)
    expect(wordDetail(rows(1391500)).alternatives.map(form => form.value)).toEqual(['煎る', '熬る'])
  })

  test('shows CompoundPitch when UniDic has no pitch, and none when neither has', () => {
    const entry: EntryRow = {
      ...rows(1546640).entry,
      headword: '記者会見',
      reading: 'きしゃかいけん',
      pitch: null,
      compoundPitch: {
        downstep: 3,
        moraCount: 6,
        sourceIdentity: 'UniDic 3.1.0 compound accent rule (C2)'
      }
    }
    const detail = wordDetail({ ...rows(1546640), entry })
    expect(detail.pitch?.morae.map(mora => mora.mora)).toEqual([
      'キ',
      'シャ',
      'カ',
      'イ',
      'ケ',
      'ン'
    ])
    expect(detail.pitch?.morae.map(mora => mora.high)).toEqual([
      false,
      true,
      true,
      false,
      false,
      false
    ])
    expect(wordDetail({ ...rows(1546640), entry: { ...entry, compoundPitch: null } }).pitch).toBe(
      null
    )
  })

  test('shows no part of speech when no class has a name', () => {
    const entry = { ...rows(1546640).entry, partsOfSpeech: ['unclassified'], senses: [] }
    expect(wordDetail({ ...rows(1546640), entry }).partOfSpeech).toBe('')
  })
})

describe('wordSummary', () => {
  test('a search result with its frequency chips', () => {
    // 射る (1322180): not in the JLPT list, so only YouTube shows.
    expect(wordSummary(rows(1322180).entry, rows(1322180).frequency)).toEqual({
      entSeq: 1322180,
      headword: '射る',
      reading: 'いる',
      ruby: [{ text: '射', reading: 'い' }, { text: 'る' }],
      summary: 'to shoot (arrow, bolt, dart)',
      frequency: [{ source: 'YouTube', value: '20,940', tier: 'uncommon', spokenTier: 'uncommon' }]
    })
  })
})
