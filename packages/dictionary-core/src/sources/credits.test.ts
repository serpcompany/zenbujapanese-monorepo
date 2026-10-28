import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { wordCardLicense, wordCardSources } from '../cards/sources'
import { creditsShownBy, type SourceCredit, sourceCredits } from './credits'

const everyCredit: SourceCredit[] = Object.values(sourceCredits)

const names = (credits: readonly SourceCredit[]) => credits.map(credit => credit.name)

const recordedSources = readFileSync(
  new URL('../../../../docs/data-sources.md', import.meta.url),
  'utf8'
)
  .split('\n')
  .filter(line => line.startsWith('|'))
  .map(row => ({
    row,
    cells: row
      .replace(/^\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map(cell => cell.trim())
  }))
  .filter(({ cells }) => cells[0] !== 'Category' && !/^-+$/.test(cells[0] ?? ''))
  .map(({ row, cells }) => {
    const [, source = '', , consumers = '', credit = ''] = cells
    return {
      row,
      cells,
      source: /^\[(.+)\]\(\S+\)$/.exec(source)?.[1],
      consumers: consumers
        .replace(/\([^)]*\)/g, '')
        .split(',')
        .map(consumer => consumer.trim()),
      credit
    }
  })

const credited = recordedSources.filter(recorded => recorded.credit !== 'None')

describe('the source credits', () => {
  test('are read from every row of the table in docs/data-sources.md', () => {
    expect(recordedSources.length).toBeGreaterThan(everyCredit.length)
    for (const { row, cells, source } of recordedSources) {
      expect(cells, row).toHaveLength(5)
      expect(source, row).toBeTruthy()
    }
  })

  test('credit every source docs/data-sources.md records a credit for, and no other', () => {
    expect(credited.map(recorded => recorded.credit).sort()).toEqual(names(everyCredit).sort())
  })

  test('are each recorded on the row of the source they name', () => {
    for (const { row, source, credit } of credited) {
      expect(source?.toLowerCase(), row).toContain(credit.toLowerCase())
    }
  })

  test('leave uncredited only the three sources the doc has always marked so', () => {
    expect(
      recordedSources
        .filter(recorded => recorded.credit === 'None')
        .map(recorded => recorded.source)
    ).toEqual(["Apple's App Store lookup", 'YouTube', '`Zenbu Word Relationships`'])
  })

  test('list each credit for the clients the doc says use its source', () => {
    for (const { source, consumers, credit } of credited) {
      const clients = everyCredit.find(listed => listed.name === credit)?.clients ?? []
      expect(clients.includes('app'), source).toBe(consumers.includes('iOS'))
      expect(clients.includes('website'), source).toBe(consumers.includes('Website'))
      expect(clients.includes('extension'), source).toBe(consumers.includes('Extension'))
      expect(
        consumers.filter(consumer => !['iOS', 'Website', 'Extension'].includes(consumer))
      ).toEqual([])
    }
  })

  test('say Jiten’s lists were modified, and carry its share-alike notice', () => {
    const { credit, license, notice } = sourceCredits.jiten
    expect(credit).toMatch(/by Jiten \(jiten\.moe\), modified\.$/)
    expect(license.name).toBe('CC BY-SA 4.0')
    expect(notice).toBe(
      'The rankings from Jiten are adapted from its data, and are shared under the same licence, CC BY-SA 4.0.'
    )
  })

  test('name the Wikipedia and JLPT lists as their authors do', () => {
    expect(sourceCredits.wikipedia.name).toBe('Wikipedia Word Frequency Clean')
    expect(sourceCredits.jlpt.name).toBe('JLPT vocabulary lists')
    expect(sourceCredits.jlptKanji.name).toBe('JLPT kanji lists')
  })

  test('link Tatoeba at its English page, since its home page redirects there', () => {
    expect(sourceCredits.tatoeba.url).toBe('https://tatoeba.org/en/')
  })

  test('are each named once, under their own key, with a credit, a licence, and a link', () => {
    expect(Object.keys(sourceCredits)).toEqual(everyCredit.map(credit => credit.id))
    expect(new Set(names(everyCredit)).size).toBe(everyCredit.length)
    for (const { name, credit, license, url } of everyCredit) {
      expect(credit, name).toMatch(/\.$/)
      expect(license.name, name).not.toBe('')
      expect(url, name).toMatch(/^https:\/\//)
      expect(license.url ?? url, name).toMatch(/^https:\/\//)
    }
  })

  test('are shown whole by the app, and without the app’s handwriting model by the website', () => {
    expect(creditsShownBy('app').credits).toEqual(everyCredit)
    expect(names(creditsShownBy('website').credits)).toEqual(
      names(everyCredit).filter(name => name !== 'DaKanji')
    )
    expect(() => creditsShownBy('watch')).toThrow('No client is named watch')
  })

  test('are shown by the extension for what it looks up offline, without search', () => {
    expect(names(creditsShownBy('extension').credits)).toEqual([
      'JMdict',
      'KANJIDIC2',
      'RADKFILE',
      'KanjiVG',
      'Kanjium',
      'UniDic',
      'JLPT vocabulary lists',
      'JLPT kanji lists',
      'TUBELEX',
      'Wikipedia Word Frequency Clean',
      'Jiten',
      'Kuromoji',
      'Tatoeba'
    ])
  })

  test('come with the sentence that says every source is converted and shared alike', () => {
    for (const client of ['app', 'website', 'extension']) {
      expect(creditsShownBy(client).conversionNotice).toBe(
        'Zenbu converts each source into its own formats and shares converted Creative Commons data under the same licence.'
      )
    }
  })
})

describe('word cards’ sources', () => {
  test('take each name, licence, and link from the source credits', () => {
    const { jmdict, kanjidic2, unidic, jlpt, tubelex, wikipedia, jiten } = sourceCredits
    expect(wordCardSources.map(({ name, license, url }) => ({ name, license, url }))).toEqual([
      {
        name: `${jmdict.name} and ${kanjidic2.name}`,
        license: jmdict.license.name,
        url: jmdict.license.url
      },
      ...[unidic, jlpt, tubelex, wikipedia, jiten].map(({ name, license, url }) => ({
        name,
        license: license.name,
        url
      }))
    ])
    expect(kanjidic2.license).toEqual(jmdict.license)
  })

  test('are the six language-data/word-cards.md names', () => {
    expect(wordCardSources.map(source => source.name)).toEqual([
      'JMdict and KANJIDIC2',
      'UniDic',
      'JLPT vocabulary lists',
      'TUBELEX',
      'Wikipedia Word Frequency Clean',
      'Jiten'
    ])
  })

  test('share the cards under the licence Jiten’s credit names', () => {
    expect(wordCardLicense).toMatchObject(sourceCredits.jiten.license)
    expect(wordCardLicense.statement).toContain(`shared under ${sourceCredits.jiten.license.name}`)
  })
})
