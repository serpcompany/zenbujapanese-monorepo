// The app's Kuromoji morphology as its example links see it: KuromojiMorphologyClient.swift's
// conversion of kuromoji.js tokens into candidates, and JapaneseInflectionGrouping.swift, which
// joins a verb or adjective with its inflection pieces.
// Change the Swift and this port in the same PR, and re-record the word-detail suite; the
// Search parity workflow checks that both change (issue 464).

/** A token as kuromoji.js's `tokenize` returns it (the fields the app decodes). */
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

/** JapaneseMorphologyCandidate. */
export interface MorphologyCandidate {
  surface: string
  dictionaryForm: string
  normalizedForm: string
  reading: string
  partOfSpeech: string[]
  isOutOfVocabulary: boolean
  children: MorphologyCandidate[]
  /** A word joined from a head and its inflection pieces, such as 見なかった. */
  joinsInflection: boolean
}

/**
 * KuromojiJapaneseMorphologyAdapter.analyze: the tokens as candidates, or null where the app
 * throws `invalidProviderRange` (tokens that don't tile the text), which makes its analyzer fall
 * back to the whole text as one unlinked token.
 */
export function kuromojiCandidates(
  text: string,
  tokens: KuromojiToken[]
): MorphologyCandidate[] | null {
  let previousEnd = 0
  const candidates: MorphologyCandidate[] = []
  for (const token of tokens) {
    // word_position is 1-based, in UTF-16 code units, as NSRange reads it.
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

const isInflectingHead = (candidate: MorphologyCandidate) =>
  candidate.partOfSpeech[0] === '動詞' || candidate.partOfSpeech[0] === '形容詞'

/** IPADIC tags a na-adjective stem as a noun with 形容動詞語幹; UniDic tags it 形状詞. */
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
      // IPADIC tags れる, られる, せる, and させる as suffix verbs.
      if (pos.includes('接尾')) return true
      // Helper verbs such as いる and しまう continue a te-form: 見ている, 見てしまう.
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

/** JapaneseInflectionGrouping.group. */
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
