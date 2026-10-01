import { graphemeCount } from '../detail/text'
import { graphemes } from './query'

export type WordClass = 'ichidan' | 'godan' | 'kuru' | 'suru' | 'suruNoun' | 'iAdjective'

export function acceptsPartsOfSpeech(wordClass: WordClass, parts: readonly string[]): boolean {
  switch (wordClass) {
    case 'ichidan':
      return parts.includes('ichidanVerb')
    case 'godan':
      return parts.includes('godanVerb')
    case 'kuru':
      return parts.includes('kuruVerb')
    case 'suru':
      return parts.includes('suruVerb')
    case 'suruNoun':
      return parts.includes('takesSuru') || parts.includes('suruVerb')
    case 'iAdjective':
      return parts.includes('iAdjective')
  }
}

export interface Deinflection {
  term: string
  wordClasses: WordClass[]
  depth: number
}

interface Rule {
  inflected: string
  base: string
  input: WordClass[]
  output: WordClass[]
}

interface VerbPattern {
  base: string
  wordClass: WordClass
  negative: string[]
  continuative: string[]
  te: string[]
  ta: string[]
  conditional: string[]
  volitional: string[]
  imperative: string[]
  derived: string[]
}

const maximumDepth = 6

const length = graphemeCount
const dropLast = (value: string) => graphemes(value).slice(0, -1).join('')
const pastForm = (te: string) => dropLast(te) + (te.endsWith('で') ? 'だ' : 'た')
const ikuSoundChangeStems = ['行', 'い']

function verbPatterns(): VerbPattern[] {
  const patterns: VerbPattern[] = [
    {
      base: 'る',
      wordClass: 'ichidan',
      negative: [''],
      continuative: [''],
      te: ['て'],
      ta: ['た'],
      conditional: ['れ'],
      volitional: ['よう'],
      imperative: ['ろ', 'よ'],
      derived: ['られる', 'させる', 'れる']
    }
  ]
  const godanRows: [string, string, string, string, string, string][] = [
    ['う', 'わ', 'い', 'え', 'お', 'って'],
    ['く', 'か', 'き', 'け', 'こ', 'いて'],
    ['ぐ', 'が', 'ぎ', 'げ', 'ご', 'いで'],
    ['す', 'さ', 'し', 'せ', 'そ', 'して'],
    ['つ', 'た', 'ち', 'て', 'と', 'って'],
    ['ぬ', 'な', 'に', 'ね', 'の', 'んで'],
    ['ぶ', 'ば', 'び', 'べ', 'ぼ', 'んで'],
    ['む', 'ま', 'み', 'め', 'も', 'んで'],
    ['る', 'ら', 'り', 'れ', 'ろ', 'って']
  ]
  for (const [ending, a, i, e, o, te] of godanRows) {
    patterns.push({
      base: ending,
      wordClass: 'godan',
      negative: [a],
      continuative: [i],
      te: [te],
      ta: [pastForm(te)],
      conditional: [e],
      volitional: [`${o}う`],
      imperative: [e],
      derived: [`${a}れる`, `${a}せる`, `${e}る`]
    })
  }
  for (const stem of ikuSoundChangeStems) {
    patterns.push({
      base: `${stem}く`,
      wordClass: 'godan',
      negative: [],
      continuative: [],
      te: [`${stem}って`],
      ta: [`${stem}った`],
      conditional: [],
      volitional: [],
      imperative: [],
      derived: []
    })
  }
  for (const [base, prefix] of [
    ['来る', '来'],
    ['くる', '']
  ]) {
    const k = prefix || 'く'
    const ko = prefix || 'こ'
    const ki = prefix || 'き'
    patterns.push({
      base,
      wordClass: 'kuru',
      negative: [ko],
      continuative: [ki],
      te: [`${ki}て`],
      ta: [`${ki}た`],
      conditional: [`${k}れ`],
      volitional: [`${ko}よう`],
      imperative: [`${ko}い`],
      derived: [`${ko}られる`, `${ko}させる`, `${ko}れる`]
    })
  }
  patterns.push({
    base: 'する',
    wordClass: 'suru',
    negative: ['し'],
    continuative: ['し'],
    te: ['して'],
    ta: ['した'],
    conditional: ['すれ'],
    volitional: ['しよう'],
    imperative: ['しろ', 'せよ'],
    derived: ['される', 'させる', 'できる']
  })
  return patterns
}

function verbRules(pattern: VerbPattern): Rule[] {
  const rules: Rule[] = []
  const output: WordClass[] = [pattern.wordClass]
  const add = (stems: string[], suffixes: string[], input: WordClass[] = []) => {
    for (const stem of stems) {
      for (const suffix of suffixes) {
        rules.push({ inflected: stem + suffix, base: pattern.base, input, output })
      }
    }
  }
  add(pattern.negative, ['ない'], ['iAdjective'])
  add(pattern.negative, ['ず', 'ずに', 'ぬ'])
  add(pattern.continuative, [
    'ます',
    'ました',
    'ません',
    'ませんでした',
    'ましょう',
    'まして',
    'なさい',
    'ながら',
    'そう'
  ])
  add(pattern.continuative, ['たい'], ['iAdjective'])
  add(pattern.continuative, ['すぎる'], ['ichidan'])
  add(pattern.te, ['', 'ください'])
  add(pattern.te, ['いる', 'る'], ['ichidan'])
  add(pattern.te, ['しまう', 'おく'], ['godan'])
  add(pattern.ta, ['', 'ら', 'り'])
  add(pattern.conditional, ['ば'])
  add(pattern.volitional, [''])
  add(pattern.imperative, [''])
  add(pattern.derived, [''], ['ichidan'])
  for (const te of pattern.te) {
    const contractedTeShimau = dropLast(te) + (te.endsWith('で') ? 'じゃう' : 'ちゃう')
    rules.push({ inflected: contractedTeShimau, base: pattern.base, input: ['godan'], output })
  }
  return rules.filter(rule => rule.inflected !== '')
}

function adjectiveRules(): Rule[] {
  const adjective: WordClass[] = ['iAdjective']
  const surface: [string, WordClass[]][] = [
    ['く', []],
    ['くて', []],
    ['かった', []],
    ['かったら', []],
    ['かったり', []],
    ['ければ', []],
    ['さ', []],
    ['そう', []],
    ['かろう', []],
    ['くない', adjective],
    ['すぎる', ['ichidan']],
    ['くなる', ['godan']]
  ]
  return [
    ...surface.map(([inflected, input]) => ({ inflected, base: 'い', input, output: adjective })),
    { inflected: 'ないで', base: 'ない', input: [], output: adjective }
  ]
}

const rules: Rule[] = [...verbPatterns().flatMap(verbRules), ...adjectiveRules()]

export function deinflect(text: string): Deinflection[] {
  if (!text) return []
  const results: Deinflection[] = []
  const seen = new Set([`${text}|`])
  let frontier: { term: string; classes: WordClass[] }[] = [{ term: text, classes: [] }]
  for (let depth = 1; depth <= maximumDepth; depth++) {
    const next: typeof frontier = []
    for (const { term, classes } of frontier) {
      for (const rule of rules) {
        if (!term.endsWith(rule.inflected)) continue
        if (!(length(term) > length(rule.inflected) || length(rule.base) > 1)) continue
        if (classes.length > 0 && !rule.input.some(wordClass => classes.includes(wordClass))) {
          continue
        }
        const base = term.slice(0, -rule.inflected.length) + rule.base
        const key = `${base}|${[...rule.output].sort().join(',')}`
        if (base === text || seen.has(key)) continue
        seen.add(key)
        results.push({ term: base, wordClasses: [...rule.output], depth })
        next.push({ term: base, classes: rule.output })
        if (rule.output.includes('suru') && base.endsWith('する') && length(base) > 2) {
          results.push({ term: base.slice(0, -2), wordClasses: ['suruNoun'], depth })
        }
      }
    }
    if (next.length === 0) break
    frontier = next
  }
  return results
}
