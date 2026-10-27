import type {
  KanjiDetailsProps,
  LearnerPromptKind,
  ShownKanjiDetails
} from '@zenbu/ui/dictionary/kanji-details'
import type { KanjiDetailsData } from '@/lib/dictionary/kanji-details'
import { kanjiDetailsIn } from '@/lib/dictionary/screen-text'
import { kanjiSearchPath } from '@/lib/dictionary/urls'
import { type Locale, sourceLang } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'
import { ItemActions } from './item-actions'
import { LearnerPrompt } from './learner-prompt'
import { addWordPaths, kanjiTargets, wordLinks } from './word-links'

export function kanjiActionsIn(locale: Locale) {
  return (kanji: ShownKanjiDetails) => (
    <ItemActions
      title={kanji.character}
      shareText={kanji.shareText}
      path={localizedPath(kanjiSearchPath(kanji.character), locale)}
      name={kanji.character}
      locale={locale}
      text={getDictionary(locale).learner}
    />
  )
}

export function learnerPromptIn(locale: Locale) {
  return (kind: LearnerPromptKind) => (
    <LearnerPrompt kind={kind} locale={locale} text={getDictionary(locale).learner} />
  )
}

export function kanjiDetailsProps(kanji: KanjiDetailsData, locale: Locale): KanjiDetailsProps {
  const shown = kanjiDetailsIn(kanji, locale)
  return {
    kanji: shown,
    lang: sourceLang(locale),
    text: getDictionary(locale).chrome,
    renderWordLink: wordLinks(addWordPaths(new Map(), kanjiTargets(kanji)), locale),
    actions: kanjiActionsIn(locale)(shown),
    learnerPrompt: learnerPromptIn(locale)
  }
}
