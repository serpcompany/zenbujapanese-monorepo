import { exampleCountText, noExamplesMessage } from '@zenbu/dictionary-core/detail/examples'
import type { ShownWordKanji, ShownWordSections } from '@zenbu/ui/dictionary/word-sections'
import type { Locale } from '@/lib/i18n/config'
import { coreText } from '@/lib/i18n/core-text'
import { getDictionary } from '@/lib/i18n/dictionary'
import { fill } from '@/lib/i18n/format'
import type { PageExample, WordPageKanji, WordPageWithKanji } from './data'
import { frequencyRowsIn, kanjiDetailsIn } from './screen-text'

export function wordSectionsIn(
  word: WordPageWithKanji,
  locale: Locale
): ShownWordSections<PageExample> {
  const text = (value: string) => coreText(value, locale)
  const t = getDictionary(locale).word
  const kanji = (items: readonly WordPageKanji[]): ShownWordKanji[] =>
    items.map(item => ({
      character: item.character,
      meaning: item.meaning,
      details: item.details ? kanjiDetailsIn(item.details, locale) : null
    }))
  const count = exampleCountText(word.exampleCount)
  return {
    sections: word.sections.map(section => ({ ...section, title: text(section.title) })),
    senses: word.senses.map(sense => ({
      number: sense.number,
      meaning: sense.meaning,
      notes: sense.noteText
        ? sense.notes.map(note => {
            const shown = text(note)
            return { text: shown, source: shown === note }
          })
        : [],
      example: sense.example
    })),
    frequencyRows: frequencyRowsIn(word.frequencyRows, locale),
    alternatives: word.alternatives.map(form => ({
      ...form,
      labels:
        form.labels.length > 0
          ? fill(t.formLabels, { labels: form.labels.map(text).join(t.labelSeparator) })
          : null
    })),
    kanji: kanji(word.kanji),
    alternativeKanji: kanji(word.alternativeKanji),
    related: word.related.map(related => ({ ...related, relation: text(related.relation) })),
    examples:
      word.exampleCount && word.examples.length > 0
        ? { count: count === null ? null : text(count) }
        : { empty: text(noExamplesMessage) }
  }
}
