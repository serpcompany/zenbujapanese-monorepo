import type { KanaScript } from '@zenbu/dictionary-core/browse/kana'
import { converterFor } from './converters'
import { toHiragana, toKatakana } from './kana'
import { kanaToRomaji } from './kana-to-romaji'
import type { ConverterSlug } from './paths'
import { romajiToKana } from './romaji-to-kana'
import { everyWidthChange, fullToHalf, halfToFull, type WidthOptions } from './width'

export interface ConverterOptions {
  script: KanaScript
  widths: WidthOptions
}

export const defaultConverterOptions: ConverterOptions = {
  script: 'hiragana',
  widths: everyWidthChange
}

const conversions: Record<ConverterSlug, (text: string, options: ConverterOptions) => string> = {
  'hiragana-to-katakana': text => toKatakana(text),
  'katakana-to-hiragana': text => toHiragana(text),
  'romaji-to-kana': (text, { script }) => romajiToKana(text, script),
  'kana-to-romaji': text => kanaToRomaji(text),
  'half-width-to-full-width': (text, { widths }) => halfToFull(text, widths),
  'full-width-to-half-width': (text, { widths }) => fullToHalf(text, widths)
}

export const convert = (
  slug: ConverterSlug,
  text: string,
  options: ConverterOptions = defaultConverterOptions
) => conversions[slug](text.normalize('NFC'), options)

type Side = 'from' | 'to'

export interface Edit {
  side: Side
  text: string
}

export function bothSides(slug: ConverterSlug, edit: Edit, options: ConverterOptions) {
  if (edit.side === 'from') return { from: edit.text, to: convert(slug, edit.text, options) }
  return { from: convert(converterFor(slug).reverse, edit.text, options), to: edit.text }
}
