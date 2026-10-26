import { describe, expect, test } from 'vitest'
import { partOfSpeechPhrase } from '../detail/part-of-speech'
import { browseCategories } from './categories'

describe('the label a word in a category shows', () => {
  test('a part of speech’s is the phrase the word page writes for one of its labels', () => {
    const labelled = browseCategories.filter(
      category => category.kind === 'partOfSpeech' && category.wordLabel
    )
    expect(labelled.length).toBeGreaterThan(20)
    for (const category of labelled) {
      const written = category.labels.flatMap(label => [
        partOfSpeechPhrase([label]),
        partOfSpeechPhrase(['verb', label])
      ])
      const { wordLabel } = category
      expect(
        written.includes(wordLabel ?? '') || written.includes(`Verb (${wordLabel})`),
        `${category.slug}: ${wordLabel} among ${written.join(', ')}`
      ).toBe(true)
    }
  })

  test('only a part of speech or a usage note has one, which the website names the category by', () => {
    const kinds = new Set(
      browseCategories.filter(category => category.wordLabel).map(category => category.kind)
    )
    expect([...kinds].sort()).toEqual(['partOfSpeech', 'usage'])
  })
})
