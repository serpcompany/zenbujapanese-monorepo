import { shortGloss } from '../detail/text'
import { isFunctionWord, type MorphologyCandidate } from './morphology'

export function wordMeaning(
  word: Pick<MorphologyCandidate, 'partOfSpeech'>,
  firstMeaning: string | null
): string | null {
  if (firstMeaning === null || isFunctionWord(word)) return null
  return shortGloss(firstMeaning)
}
