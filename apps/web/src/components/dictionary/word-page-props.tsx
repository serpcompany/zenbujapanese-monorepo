import type { WordDetail } from '@zenbu/dictionary-core/detail/word'
import type { WordHeader } from '@zenbu/ui/dictionary/word-header'
import type { WordSectionsProps } from '@zenbu/ui/dictionary/word-sections'
import type { ComponentProps } from 'react'
import { wordItem } from '@/lib/account/saved-item'
import type { PageExample, WordPageWithKanji } from '@/lib/dictionary/data'
import { wordExamplesAnchor } from '@/lib/dictionary/results/links'
import { conjugationsIn, conjugationsText, exampleListText } from '@/lib/dictionary/screen-text'
import { wordSectionsIn } from '@/lib/dictionary/word-screen'
import { type Locale, sourceLang } from '@/lib/i18n/config'
import { coreText } from '@/lib/i18n/core-text'
import { getDictionary } from '@/lib/i18n/dictionary'
import { kanjiActionsIn, kanjiLearnerPromptIn, learnerPromptIn } from './kanji-props'
import { showUnsupported } from './site-actions'
import { SiteConjugationsSection, SiteExampleList, SiteMeaningExample } from './site-examples'
import { addWordPaths, kanjiTargets, type LinkedTarget, wordLinks } from './word-links'

export type WordHeaderData = Pick<
  WordDetail,
  'headword' | 'ruby' | 'reading' | 'pronounce' | 'pitch' | 'partOfSpeechRow' | 'conjugations'
>

export function wordHeaderIn(
  word: WordHeaderData,
  locale: Locale
): ComponentProps<typeof WordHeader> {
  const t = getDictionary(locale)
  const text = (value: string) => coreText(value, locale)
  return {
    headword: word.headword,
    ruby: word.ruby,
    reading: word.reading,
    pronounce: text(word.pronounce),
    pitch: word.pitch ? { ...word.pitch, spoken: text(word.pitch.spoken) } : null,
    partOfSpeech: text(word.partOfSpeechRow),
    conjugations: word.conjugations !== null,
    text: { pronounce: t.pronounce, conjugations: t.conjugations },
    onUnsupported: showUnsupported
  }
}

function wordPageTargets(word: WordPageWithKanji): LinkedTarget[] {
  return [
    ...word.alternatives.flatMap(form =>
      form.kanji ? [[{ kanji: form.kanji }, form.path] as const] : []
    ),
    ...word.related.flatMap(related =>
      related.entSeq === null ? [] : [[{ entSeq: related.entSeq }, related.path] as const]
    ),
    ...[...word.kanji, ...word.alternativeKanji].flatMap(item =>
      item.details ? kanjiTargets(item.details) : []
    )
  ]
}

export function wordSectionsProps(
  word: WordPageWithKanji,
  locale: Locale
): WordSectionsProps<PageExample> {
  const t = getDictionary(locale)
  return {
    word: wordSectionsIn(word, locale),
    lang: sourceLang(locale),
    text: { lang: locale, word: t.word, frequency: t.frequency, chrome: t.chrome },
    renderWordLink: wordLinks(addWordPaths(new Map(), wordPageTargets(word)), locale),
    renderMeaningExample: (example, meaning) => (
      <SiteMeaningExample
        example={example}
        meaning={meaning}
        locale={locale}
        text={exampleListText(locale)}
      />
    ),
    kanjiActions: kanjiActionsIn(locale),
    kanjiLearnerPrompt: kanjiLearnerPromptIn(locale),
    learnerPrompt: learnerPromptIn(locale, wordItem(word)),
    conjugations: word.conjugations ? (
      <SiteConjugationsSection
        conjugations={conjugationsIn(word.conjugations, locale)}
        locale={locale}
        text={conjugationsText(locale)}
      />
    ) : null,
    examples: word.exampleCount ? (
      <SiteExampleList
        initial={word.examples}
        listed={word.exampleCount.listed}
        path={word.examplesPath}
        locale={locale}
        text={exampleListText(locale)}
      />
    ) : null,
    examplesAnchor: wordExamplesAnchor
  }
}
