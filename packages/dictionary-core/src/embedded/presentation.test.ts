import { describe, expect, test } from 'vitest'
import { ask } from './fake-host'
import type { EmbeddedEntry, EmbeddedKanjiPage, EmbeddedWordPage } from './presentation'
import { eat, host, kanjiFiles } from './presentation-fixture'

describe('the embedded presentation engine', () => {
  test('splits a word’s reading over its kanji, kanji by kanji where only one split fits', async () => {
    expect(await ask(host, 'ruby', JSON.stringify(['学校', 'がっこう']))).toEqual([
      { text: '学校', reading: 'がっこう', kanjiReadings: ['がっ', 'こう'] }
    ])
    expect(await ask(host, 'ruby', JSON.stringify(['食べる', 'たべる']))).toEqual([
      { text: '食', reading: 'た' },
      { text: 'べる' }
    ])
    expect(await ask(host, 'ruby', JSON.stringify(['かな', 'かな']))).toEqual([{ text: 'かな' }])
  })

  test('says so when its host has no kanji files, and refuses files it does not read', async () => {
    const pair = JSON.stringify(['学校', 'がっこう'])
    await expect(ask({}, 'ruby', pair)).rejects.toThrow('The host has no kanji files to read')
    await expect(ask({ kanjiSources: () => null }, 'ruby', pair)).rejects.toThrow(
      'The host has no kanji files to read'
    )
    const other = {
      ...host,
      kanjiSources: () => ({ ...kanjiFiles, schema: 'zenbu.kanji-elements.v9' })
    }
    await expect(ask(other, 'ruby', pair)).rejects.toThrow(
      'KanjiElementReferenceData.json is zenbu.kanji-elements.v9'
    )
  })

  test('reads a word whose kanji the files do not hold without splitting its reading', async () => {
    expect(await ask(host, 'ruby', JSON.stringify(['猫舌', 'ねこじた']))).toEqual([
      { text: '猫舌', reading: 'ねこじた' }
    ])
  })

  test('builds a word page from the entry the host read', async () => {
    const page = (await ask(host, 'wordPage', JSON.stringify(eat))) as EmbeddedWordPage
    expect(page.ruby).toEqual([{ text: '食', reading: 'た' }, { text: 'べる' }])
    expect(page.partOfSpeech).toBe('Ichidan verb (transitive)')
    expect(page.senses).toEqual([
      { number: 1, meaning: 'to eat', notes: [], noteText: null },
      { number: 2, meaning: 'to live on', notes: ['e.g. a salary'], noteText: 'e.g. a salary' }
    ])
    expect(page.alternatives).toEqual([
      { value: '喰べる', kind: 'written', labels: ['rare'], labelText: '(rare)', kanji: '喰' }
    ])
    expect(page.kanji).toEqual(['食'])
    expect(page.alternativeKanji).toEqual(['喰'])
    expect(page.related).toEqual([
      {
        headword: '学校',
        reading: 'がっこう',
        ruby: [{ text: '学校', reading: 'がっこう' }],
        relation: 'See also',
        summary: 'school',
        description: 'See also · school',
        entSeq: null
      }
    ])
    expect(page.sections.map(section => section.title)).toEqual([
      'Meaning',
      'Alternatives',
      'Kanji',
      'Alternative kanji',
      'Related words',
      'Lists',
      'Notes',
      'Examples'
    ])
    expect(page.pronounce).toBe('Pronounce たべる')
    expect(page.partOfSpeechRow).toBe('Ichidan verb (transitive)')
    expect(page.noExamples).toBe('No source-matched examples')
    expect(page.shareText).toBe('食べる【たべる】\n1. to eat\n2. to live on')
    expect(page.pitch).toMatchObject({
      downstep: 2,
      moraCount: 3,
      source: 'unidic',
      particleHigh: false,
      morae: [
        { mora: 'タ', high: false },
        { mora: 'ベ', high: true },
        { mora: 'ル', high: false }
      ],
      spoken: 'Pitch accent, downstep 2, 3 mora'
    })
  })

  test("shows the compound estimate's pitch, and names it, only for an entry UniDic has no pitch for", async () => {
    const estimated = { ...eat, pitch: null }
    const page = (await ask(host, 'wordPage', JSON.stringify(estimated))) as EmbeddedWordPage
    expect(page.pitch).toMatchObject({ downstep: 1, source: 'compound accent rule' })
    const neither = { ...eat, pitch: null, compoundPitch: null }
    expect(((await ask(host, 'wordPage', JSON.stringify(neither))) as EmbeddedWordPage).pitch).toBe(
      null
    )
  })

  test('gives a verb its conjugations, with the note that tells same-spelled forms apart', async () => {
    const { conjugations } = (await ask(host, 'wordPage', JSON.stringify(eat))) as EmbeddedWordPage
    expect(conjugations).toMatchObject({
      rule: 'Drop る, then add the ending.',
      modes: ['Plain', 'Polite']
    })
    const plain = conjugations?.rows.Plain ?? []
    expect(plain.map(row => row.surface).slice(0, 3)).toEqual(['食べる', '食べた', '食べない'])
    expect(plain[0]).toMatchObject({
      kind: 'present-future',
      title: 'Present/Future',
      ending: 'る',
      ruby: [{ text: '食', reading: 'た' }, { text: 'べる' }],
      rowFurigana: false,
      note: null
    })
    expect(plain.find(row => row.kind === 'potential')?.note).toBe(
      'Same spelling as Passive. Context tells them apart.'
    )
    expect(conjugations?.rows.Polite[0]).toMatchObject({
      surface: '食べます',
      pronounce: 'Pronounce たべます'
    })
    expect(conjugations?.examples).toEqual({
      title: 'Examples',
      empty: 'No example sentences use this form yet.'
    })
  })

  test('names the sections a word or kanji page shows before, or without, its answer', async () => {
    expect(await ask(host, 'wordPageWithoutContent', 'たべる')).toEqual({
      sections: [
        { kind: 'meaning', title: 'Meaning' },
        { kind: 'lists', title: 'Lists' },
        { kind: 'notes', title: 'Notes' },
        { kind: 'examples', title: 'Examples' }
      ],
      pronounce: 'Pronounce たべる',
      noExamples: 'No source-matched examples'
    })
    expect(await ask(host, 'kanjiPageWithoutContent', '')).toEqual({
      sections: [
        { kind: 'lists', title: 'Lists' },
        { kind: 'notes', title: 'Notes' }
      ]
    })
  })

  test('gives a word that does not conjugate no table, and one without pitch no contour', async () => {
    const noun: EmbeddedEntry = {
      ...eat,
      headword: '学校',
      reading: 'がっこう',
      partsOfSpeech: ['noun'],
      senses: [{ meaning: 'school', notes: [], partsOfSpeech: ['noun'] }],
      pitch: null,
      compoundPitch: null
    }
    const page = (await ask(host, 'wordPage', JSON.stringify(noun))) as EmbeddedWordPage
    expect(page.conjugations).toBeNull()
    expect(page.pitch).toBeNull()
    expect(page.ruby).toEqual([
      { text: '学校', reading: 'がっこう', kanjiReadings: ['がっ', 'こう'] }
    ])
    expect(page.kanji).toEqual(['学', '校'])
  })

  const words = [
    { id: 'w1', headword: '学校', reading: 'がっこう', summary: 'school' },
    { id: 'w2', headword: '校長', reading: 'こうちょう', summary: 'principal' },
    { id: 'w3', headword: '高校', reading: 'こうこう', summary: 'high school' },
    { id: 'w4', headword: '校舎', reading: 'こうしゃ', summary: 'school building' },
    { id: 'w5', headword: '校正', reading: 'こうせい', summary: 'proofreading' }
  ]

  test('builds a kanji page from its reference, its elements, and the words the host found', async () => {
    const page = (await ask(
      host,
      'kanjiPage',
      JSON.stringify({ character: '校', words, leadingWord: 'w3' })
    )) as EmbeddedKanjiPage
    expect(page.hasReference).toBe(true)
    expect(page.stats).toEqual([
      { kind: 'strokes', label: 'Stroke', value: '1', spoken: '1 Stroke' }
    ])
    expect(page.meanings).toEqual(['校 meaning', 'second', 'third'])
    expect(page.readings.map(reading => [reading.label, reading.value])).toEqual([
      ['On', 'コウ'],
      ['On', 'キョウ'],
      ['Name', 'たかし']
    ])
    expect(page.readings[0].words.map(word => word.id)).toEqual(['w2', 'w3', 'w4'])
    expect(page.readings[1].words).toEqual([])
    expect(page.components).toEqual([])
    expect(page.elements).toEqual([
      {
        character: '木',
        role: 'meaningStructure',
        roleLabel: 'Meaning / structure',
        meanings: ['tree', 'wood', 'timber'],
        linkedOnReadings: [],
        description: 'tree, wood, timber',
        spoken: 'Element 木, meaning / structure, tree, wood, timber'
      },
      {
        character: '交',
        role: 'sound',
        roleLabel: 'Sound',
        meanings: [],
        linkedOnReadings: ['コウ'],
        description: 'Linked on-readings: コウ',
        spoken: 'Element 交, sound, '
      },
      {
        character: '父',
        role: 'soundPattern',
        roleLabel: 'Sound pattern',
        meanings: [],
        linkedOnReadings: ['コウ', 'フ'],
        description: 'Linked on-readings: コウ, フ',
        spoken: 'Element 父, sound pattern, '
      }
    ])
    expect(page.words.map(word => word.id)).toEqual(['w3', 'w1', 'w2', 'w4', 'w5'])
    expect(page.words[0]).toMatchObject({
      headword: '高校',
      ruby: [{ text: '高校', reading: 'こうこう' }]
    })
    expect(page.shareText).toBe('校【コウ、キョウ、たかし】\n校 meaning, second, third')
    expect(page.savedReading).toBe('コウ')
  })

  test('lists a kanji’s components when it has no elements, with every stat it has', async () => {
    const page = (await ask(
      host,
      'kanjiPage',
      JSON.stringify({ character: '学', words: [], leadingWord: null })
    )) as EmbeddedKanjiPage
    expect(page.stats).toEqual([
      { kind: 'strokes', label: 'Strokes', value: '8', spoken: '8 Strokes' },
      { kind: 'grade', label: 'Grade', value: '1', spoken: 'Grade 1' },
      { kind: 'jlpt', label: 'JLPT', value: 'N5', spoken: 'JLPT N5' }
    ])
    expect(page.components).toEqual(['子', '冖'])
    expect(page.elements).toEqual([])
  })

  test('shows Readings, empty, for a kanji it has a reference for without readings, as the app did', async () => {
    const page = (await ask(
      host,
      'kanjiPage',
      JSON.stringify({ character: '乁', words: [], leadingWord: null })
    )) as EmbeddedKanjiPage
    expect(page).toMatchObject({ hasReference: true, readings: [], components: [] })
    expect(page.sections.map(section => section.kind)).toEqual(['readings', 'lists', 'notes'])
    const unreferenced = (await ask(
      host,
      'kanjiPage',
      JSON.stringify({ character: '㐂', words: [], leadingWord: null })
    )) as EmbeddedKanjiPage
    expect(unreferenced.sections.map(section => section.kind)).toEqual(['lists', 'notes'])
  })

  test('still lists the words of a kanji it has no reference for', async () => {
    const page = (await ask(
      host,
      'kanjiPage',
      JSON.stringify({ character: '㐂', words: words.slice(0, 1), leadingWord: null })
    )) as EmbeddedKanjiPage
    expect(page).toMatchObject({
      character: '㐂',
      hasReference: false,
      stats: [],
      meanings: [],
      readings: [],
      savedReading: '',
      shareText: '㐂'
    })
    expect(page.words.map(word => word.id)).toEqual(['w1'])
  })

  test('gives each handwriting candidate that is one kanji its first meaning, in one call', async () => {
    expect(
      await ask(host, 'candidateMeanings', JSON.stringify(['学', '学校', 'が', '㐂', '食']))
    ).toEqual(['学 meaning', null, null, null, '食 meaning'])
  })

  test('builds an element page from the element, the kanji in its family, and those containing it', async () => {
    expect(await ask(host, 'kanjiElementPage', '交')).toEqual({
      sections: [
        { kind: 'alternatives', title: 'Alternative forms' },
        { kind: 'soundPatterns', title: 'Sound patterns' },
        { kind: 'standalone', title: 'As a standalone kanji' },
        { kind: 'source', title: 'Source' }
      ],
      glyph: '交',
      meanings: [],
      explanation: null,
      soundPatterns: 'Linked on-readings: コウ',
      alternatives: ['校'],
      standalone: { character: '校', meanings: [], onReadings: ['コウ'], spoken: '校, コウ' },
      containing: [],
      structureSource: 'kanjium 8a0c',
      metadataSource: 'edrdg.kanjidic2 2026-10-05'
    })
    expect(await ask(host, 'kanjiElementPage', '木')).toMatchObject({
      explanation: 'This element contributes forms associated with tree, wood, timber, plank.',
      soundPatterns: null,
      standalone: null,
      containing: [{ character: '校' }]
    })
  })

  test('has no element page for a kanji that is no element, or for what is no kanji', async () => {
    expect(await ask(host, 'kanjiElementPage', '学')).toBeNull()
    expect(await ask(host, 'kanjiElementPage', 'あ')).toBeNull()
    expect(await ask(host, 'kanjiElementPage', '交父')).toBeNull()
  })

  test('shortens a meaning to the gloss shown under a linked word', async () => {
    expect(await ask(host, 'gloss', 'to fold (clothes, etc.), to shut')).toBe('fold')
    expect(await ask(host, 'gloss', '(note only)')).toBeNull()
  })
})
