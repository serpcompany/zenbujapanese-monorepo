import { katakana } from '../detail/text'

export type KanaScript = 'hiragana' | 'katakana'

export const kanaScripts: readonly KanaScript[] = ['hiragana', 'katakana']

export const isKanaScript = (value: string): value is KanaScript =>
  (kanaScripts as readonly string[]).includes(value)

const firstHiragana = 0x3041
const lastHiragana = 0x309f

export const hiraganaRange = {
  first: String.fromCodePoint(firstHiragana),
  last: String.fromCodePoint(lastHiragana)
}

export function kanaScriptOf(reading: string): KanaScript {
  const code = reading.codePointAt(0) ?? 0
  return code >= firstHiragana && code <= lastHiragana ? 'hiragana' : 'katakana'
}

export interface KanaCell {
  kana: string
  romaji: string
}

export interface KanaRow {
  consonant: string
  cells: (KanaCell | null)[]
}

const row = (consonant: string, kana: string, romaji: string): KanaRow => {
  const sounds = romaji.split(' ')
  return {
    consonant,
    cells: Array.from(kana).map((character, index) =>
      character === '_' ? null : { kana: character, romaji: sounds[index] }
    )
  }
}

export const gojuonRows: readonly KanaRow[] = [
  row('', 'あいうえお', 'a i u e o'),
  row('k', 'かきくけこ', 'ka ki ku ke ko'),
  row('s', 'さしすせそ', 'sa shi su se so'),
  row('t', 'たちつてと', 'ta chi tsu te to'),
  row('n', 'なにぬねの', 'na ni nu ne no'),
  row('h', 'はひふへほ', 'ha hi fu he ho'),
  row('m', 'まみむめも', 'ma mi mu me mo'),
  row('y', 'や_ゆ_よ', 'ya _ yu _ yo'),
  row('r', 'らりるれろ', 'ra ri ru re ro'),
  row('w', 'わ___を', 'wa _ _ _ wo'),
  row('n', 'ん____', 'n _ _ _ _')
]

export const dakuonRows: readonly KanaRow[] = [
  row('g', 'がぎぐげご', 'ga gi gu ge go'),
  row('z', 'ざじずぜぞ', 'za ji zu ze zo'),
  row('d', 'だぢづでど', 'da ji zu de do'),
  row('b', 'ばびぶべぼ', 'ba bi bu be bo'),
  row('p', 'ぱぴぷぺぽ', 'pa pi pu pe po')
]

export function inScript(rows: readonly KanaRow[], script: KanaScript): KanaRow[] {
  if (script === 'hiragana') return [...rows]
  return rows.map(({ consonant, cells }) => ({
    consonant,
    cells: cells.map(cell => (cell ? { ...cell, kana: katakana(cell.kana) } : null))
  }))
}

export function chartKana(script: KanaScript): Set<string> {
  return new Set(
    [...inScript(gojuonRows, script), ...inScript(dakuonRows, script)].flatMap(({ cells }) =>
      cells.flatMap(cell => (cell ? [cell.kana] : []))
    )
  )
}
