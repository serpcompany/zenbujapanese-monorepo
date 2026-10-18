import { hiragana, katakana } from '@zenbu/dictionary-core/detail/text'

const hiraganaIterationMarks = 'ゝゞ'
const katakanaIterationMarks = 'ヽヾ'

function swapIterationMarks(text: string, from: string, to: string) {
  return Array.from(text, character => {
    const mark = from.indexOf(character)
    return mark < 0 ? character : to[mark]
  }).join('')
}

export const toKatakana = (text: string) =>
  swapIterationMarks(katakana(text), hiraganaIterationMarks, katakanaIterationMarks)

export const toHiragana = (text: string) =>
  swapIterationMarks(hiragana(text), katakanaIterationMarks, hiraganaIterationMarks)
