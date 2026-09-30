const halfwidthAndCircledKatakana = /[｡-ﾟ㋐-㋾]/gu

function fold(value: string): string {
  return value.replace(halfwidthAndCircledKatakana, character => character.normalize('NFKC'))
}

const toHiraganaSpecial: Record<string, string> = {
  ヵ: 'か',
  ヶ: 'け',
  ヷ: 'わ゙',
  ヸ: 'ゐ゙',
  ヹ: 'ゑ゙',
  ヺ: 'を゙',
  ヽ: 'ゝ',
  ヾ: 'ゞ',
  ヿ: 'こと',
  ゟ: 'より'
}

const toKatakanaSpecial: Record<string, string> = {
  ゝ: 'ヽ',
  ゞ: 'ヾ',
  ゟ: 'ヨリ'
}

export function toHiragana(value: string): string {
  return fold(value)
    .replace(/[ァ-ヿゟ]/gu, character => {
      const special = toHiraganaSpecial[character]
      if (special !== undefined) return special
      const code = character.codePointAt(0) ?? 0
      return code <= 0x30f4 ? String.fromCodePoint(code - 0x60) : character
    })
    .normalize('NFC')
}

export function toKatakana(value: string): string {
  return fold(value)
    .replace(/[ぁ-ゔゝ-ゟ]/gu, character => {
      const special = toKatakanaSpecial[character]
      if (special !== undefined) return special
      return String.fromCodePoint((character.codePointAt(0) ?? 0) + 0x60)
    })
    .normalize('NFC')
}
