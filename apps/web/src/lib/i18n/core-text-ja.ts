import { glossSeparator } from '@zenbu/dictionary-core/detail/sections'
import { japaneseLabels } from './core-text-ja-labels'

type Rule = readonly [pattern: RegExp, write: (parts: string[]) => string | null]

const part = (text: string) => japaneseCoreText(text) ?? text

function known(texts: readonly string[]): string[] | null {
  const translated = texts.map(japaneseCoreText)
  return translated.every((text): text is string => text !== null) ? translated : null
}

const listed = (text: string): string[] => text.split(/, and |, | and /)

const quoted = (texts: readonly string[]) => texts.map(text => `「${text}」`).join('')

const schoolGrades = 6
const gradeNames: Record<string, string> = {
  '8': '中学校以降',
  '9': '人名用漢字',
  '10': '人名用漢字（異体字）'
}

const grade = (value: string) =>
  Number(value) <= schoolGrades ? `小学${value}年` : (gradeNames[value] ?? `学年${value}`)

const roles: Record<string, string> = {
  'meaning / structure': '意味・構造',
  sound: '音符',
  'sound pattern': '音のパターン'
}

const rules: readonly Rule[] = [
  [/^Pronounce (.+)$/, ([reading]) => `${reading}の発音を聞く`],
  [
    /^Pitch accent, downstep (\d+), (\d+) mora$/,
    ([downstep, morae]) => `アクセント：${downstep}型、${morae}拍`
  ],
  [
    /^(.+) \((transitive|intransitive|transitive or intransitive)\)$/,
    ([base, modifier]) => {
      const name = japaneseCoreText(base)
      return name === null ? null : `${name}（${part(modifier)}）`
    }
  ],
  [
    /^Same spelling as (.+)\. Context tells them apart\.$/,
    ([titles]) => `${quoted(listed(titles).map(part))}と同じ表記です。文脈で区別します。`
  ],
  [/^Show stroke order for (.+)$/, ([character]) => `${character}の書き順を見る`],
  [/^Stroke drawing grid for (.+)$/, ([character]) => `${character}の書き順の図`],
  [/^Stroke (\d+) of (\d+)$/, ([stroke, count]) => `${count}画中${stroke}画目`],
  [
    /^(\d+) strokes complete, drawing stroke (\d+)$/,
    ([done, drawing]) => `${done}画まで完了、${drawing}画目を書いています`
  ],
  [/^(\d+) strokes complete$/, ([done]) => `${done}画まで完了`],
  [/^(\d+) of (\d+) complete$/, ([done, count]) => `${count}画中${done}画完了`],
  [/^(\d+) [Ss]trokes?$/, ([count]) => `${count}画`],
  [/^Grade (\d+)$/, ([value]) => grade(value)],
  [/^JLPT (N\d)$/, ([level]) => `JLPT ${level}`],
  [
    /^(On|Kun|Name) reading ([^,]+), ([^,]+), (.*)$/,
    ([label, value, headword, summary]) => `${part(label)} ${value}、${headword}、${summary}`
  ],
  [/^Linked on-readings: (.+)$/, ([readings]) => `関連する音読み：${readings}`],
  [
    /^Element (\S+), (meaning \/ structure|sound pattern|sound), (.*)$/,
    ([glyph, role, meanings]) =>
      `構成要素${glyph}、${roles[role]}${meanings ? `、${meanings}` : ''}`
  ],
  [
    /^This element contributes forms associated with (.+)\.$/,
    ([meanings]) => `この要素は「${meanings}」に関わる形を表します。`
  ],
  [
    /^The first (\d+) of more than (\d+) examples$/,
    ([first, total]) => `例文${total}件以上のうち、最初の${first}件`
  ],
  [/^(\d+) examples$/, ([count]) => `例文${count}件`],
  [/^Search for Japanese reading (.+)$/, ([query]) => `読み「${query}」で検索`],
  [/^Search for「(.+)」$/, ([query]) => `「${query}」で検索`],
  [/^View (\d+)\+ Example Sentences$/, ([count]) => `例文を見る（${count}件以上）`],
  [/^View (\d+) Example Sentences?$/, ([count]) => `例文を見る（${count}件）`],
  [/^(.+) level (N\d)$/, ([source, level]) => `${part(source)}のレベル：${level}`],
  [
    /^(.+) frequency rank ([\d,]+), (.+)$/,
    ([source, rank, tier]) => `${part(source)}の頻度順位：${rank}位、${part(tier)}`
  ],
  [
    /^(.+) does not list this entry\. (.+)$/,
    ([name, explanation]) => `${part(name)}にはこの言葉が掲載されていません。${part(explanation)}`
  ],
  [/^(.+) does not list this entry$/, ([source]) => `${part(source)}には掲載がありません`],
  [
    /^(.+) has no rank for this entry$/,
    ([source]) => `${part(source)}にはこの言葉の順位がありません`
  ],
  [
    /^(.+) has no mapped frequency rank for this entry\.$/,
    ([name]) => `${part(name)}には、この言葉に対応する頻度順位がありません。`
  ],
  [/^(.+) rank unavailable$/, ([source]) => `${part(source)}の順位は取得できません`],
  [/^#([\d,]+)$/, ([rank]) => `${rank}位`],
  [/^Top ([\d.]+)%$/, ([percent]) => `上位${percent}%`],
  [
    /^Frequency ordering unavailable\. Showing dictionary relevance order\. (.*)$/,
    ([reason]) =>
      `頻度による並べ替えを利用できないため、辞書の関連度順で表示しています。${part(reason)}`
  ],
  [
    /^(.+) unavailable\. Search is ordered by the other enabled dictionaries\.$/,
    ([names]) =>
      `${listed(names).map(part).join('、')}は利用できません。ほかの有効な辞書の順で並べています。`
  ],
  [
    /^Sorted by (.+?)( · 1 filter)?$/,
    ([name, filter]) => `${part(name)}順${filter ? '・フィルター1件' : ''}`
  ],
  [/^(\d+) words hidden by filter$/, ([count]) => `${count}語がフィルターで非表示`],
  [/^(\d+) words shown$/, ([count]) => `${count}語を表示`],
  [/^Discovered word (\d+) of (\d+)$/, ([index, count]) => `文中の単語 ${count}件中${index}件目`],
  [
    /^Result (\d+) of (\d+), Kanji primary$/,
    ([index, count]) => `検索結果 ${count}件中${index}件目、漢字`
  ],
  [/^Result (\d+) of (\d+)$/, ([index, count]) => `検索結果 ${count}件中${index}件目`]
]

function joinedLabels(text: string): string | null {
  if (!text.includes(glossSeparator)) return null
  return known(text.split(glossSeparator))?.join('・') ?? null
}

export function japaneseCoreText(text: string): string | null {
  if (Object.hasOwn(japaneseLabels, text)) return japaneseLabels[text]
  for (const [pattern, write] of rules) {
    const match = pattern.exec(text)
    if (match) return write(match.slice(1)) ?? joinedLabels(text)
  }
  return joinedLabels(text)
}
