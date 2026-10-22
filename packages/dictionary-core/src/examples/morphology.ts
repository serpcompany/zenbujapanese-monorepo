export interface KuromojiToken {
  word_type: string
  word_position: number
  surface_form: string
  pos: string
  pos_detail_1: string
  pos_detail_2: string
  pos_detail_3: string
  basic_form: string
  reading?: string
}

export type Tokenize = (text: string) => KuromojiToken[]

export interface MorphologyCandidate {
  surface: string
  dictionaryForm: string
  normalizedForm: string
  reading: string
  partOfSpeech: string[]
  isOutOfVocabulary: boolean
  children: MorphologyCandidate[]
  joinsInflection: boolean
}

export function kuromojiCandidates(
  text: string,
  tokens: KuromojiToken[]
): MorphologyCandidate[] | null {
  let previousEnd = 0
  const candidates: MorphologyCandidate[] = []
  for (const token of tokens) {
    const start = token.word_position - 1
    const end = start + token.surface_form.length
    if (start !== previousEnd || text.slice(start, end) !== token.surface_form) return null
    previousEnd = end
    const dictionaryForm = token.basic_form === '*' ? token.surface_form : token.basic_form
    candidates.push({
      surface: token.surface_form,
      dictionaryForm,
      normalizedForm: dictionaryForm,
      reading: token.reading ?? token.surface_form,
      partOfSpeech: [token.pos, token.pos_detail_1, token.pos_detail_2, token.pos_detail_3].filter(
        part => part !== '' && part !== '*'
      ),
      isOutOfVocabulary: token.word_type !== 'KNOWN',
      children: [],
      joinsInflection: false
    })
  }
  return previousEnd === text.length ? candidates : null
}

const functionWordClasses = new Set(['助詞', '助動詞', '記号', '補助記号'])

export function isFunctionWord(candidate: Pick<MorphologyCandidate, 'partOfSpeech'>): boolean {
  return functionWordClasses.has(candidate.partOfSpeech[0] ?? '')
}

const isInflectingHead = (candidate: MorphologyCandidate) =>
  candidate.partOfSpeech[0] === '動詞' || candidate.partOfSpeech[0] === '形容詞'

function isNaAdjectiveStem(candidate: MorphologyCandidate): boolean {
  const pos = candidate.partOfSpeech
  return pos[0] === '形状詞' || (pos[0] === '名詞' && pos.includes('形容動詞語幹'))
}

function attaches(candidate: MorphologyCandidate, previous: MorphologyCandidate): boolean {
  const pos = candidate.partOfSpeech
  switch (pos[0]) {
    case '助動詞':
      return true
    case '助詞':
      return pos.includes('接続助詞') && ['て', 'で', 'ば'].includes(candidate.surface)
    case '動詞': {
      const isSuffixVerb = pos.includes('接尾')
      if (isSuffixVerb) return true
      const isHelper = pos.includes('非自立') || pos.includes('非自立可能')
      return isHelper && ['て', 'で'].includes(previous.surface)
    }
    default:
      return false
  }
}

function joined(pieces: MorphologyCandidate[]): MorphologyCandidate {
  const [head] = pieces
  return {
    surface: pieces.map(piece => piece.surface).join(''),
    dictionaryForm: head.dictionaryForm,
    normalizedForm: head.normalizedForm,
    reading: pieces.map(piece => piece.reading).join(''),
    partOfSpeech: head.partOfSpeech,
    isOutOfVocabulary: head.isOutOfVocabulary,
    children: pieces,
    joinsInflection: true
  }
}

export function groupInflections(candidates: MorphologyCandidate[]): MorphologyCandidate[] {
  const grouped: MorphologyCandidate[] = []
  let index = 0
  while (index < candidates.length) {
    const head = candidates[index]
    const pieces = [head]
    index += 1
    if (isInflectingHead(head)) {
      while (index < candidates.length && attaches(candidates[index], pieces[pieces.length - 1])) {
        pieces.push(candidates[index])
        index += 1
      }
    } else if (
      isNaAdjectiveStem(head) &&
      index < candidates.length &&
      ['な', 'で', 'に'].includes(candidates[index].surface) &&
      ['助動詞', '助詞'].includes(candidates[index].partOfSpeech[0])
    ) {
      pieces.push(candidates[index])
      index += 1
    }
    grouped.push(pieces.length === 1 ? head : joined(pieces))
  }
  return grouped
}

const isNumeral = (candidate: MorphologyCandidate) =>
  candidate.partOfSpeech[0] === '名詞' &&
  (candidate.partOfSpeech[1] === '数' || candidate.partOfSpeech[1] === '数詞')

const isCounter = (candidate: MorphologyCandidate) => candidate.partOfSpeech.includes('助数詞')

export interface NumberWithCounter {
  word: MorphologyCandidate
  pieces: number
}

export function numberWithCounterAt(
  words: readonly MorphologyCandidate[],
  start: number
): NumberWithCounter | null {
  if (!isNumeral(words[start]) || (start > 0 && isNumeral(words[start - 1]))) return null
  let end = start
  while (end < words.length && isNumeral(words[end])) end += 1
  if (end === words.length || !isCounter(words[end])) return null
  const pieces = words.slice(start, end + 1)
  const surface = pieces.map(piece => piece.surface).join('')
  return {
    word: {
      surface,
      dictionaryForm: surface,
      normalizedForm: surface,
      reading: pieces.map(piece => piece.reading).join(''),
      partOfSpeech: pieces[0].partOfSpeech,
      isOutOfVocabulary: pieces.some(piece => piece.isOutOfVocabulary),
      children: pieces,
      joinsInflection: false
    },
    pieces: pieces.length
  }
}
