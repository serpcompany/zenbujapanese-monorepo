import { type Locale, languageOf, languages } from './config'
import { getDictionary } from './dictionary'
import { fill } from './format'
import { localizedPath } from './paths'

type SwitcherLanguage = {
  code: Locale
  name: string
  short: string
  region: string
  home: string
}

export type Switcher = {
  current: Locale
  languages: readonly SwitcherLanguage[]
  label: string
}

export function switcherFor(locale: Locale): Switcher {
  const text = getDictionary(locale).chrome.switcher
  return {
    current: locale,
    languages: languages.map(language => ({
      code: language.code,
      name: language.name,
      short: language.code.toUpperCase(),
      region: language.ogLocale.slice(-2),
      home: localizedPath('/', language.code)
    })),
    label: fill(text.label, { language: languageOf(locale).name })
  }
}
