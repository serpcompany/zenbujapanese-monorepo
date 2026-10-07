import type { ExampleSentenceTokenRow } from '../detail/rows'
import type { LinkedToken } from '../examples/linking'

export const segmentationFormat = 'zenbu.segmentation.v1'

export interface SegmentedToken extends ExampleSentenceTokenRow {
  languageReferenceID?: string
  candidates?: string[]
}

export function segmentedTokens(
  linked: readonly LinkedToken[],
  rows: readonly ExampleSentenceTokenRow[]
): SegmentedToken[] {
  return linked.map((token, index) => ({
    ...rows[index],
    ...(token.entry ? { languageReferenceID: token.entry.id } : {}),
    ...(!token.entry && token.candidates.length > 0
      ? { candidates: token.candidates.map(candidate => candidate.id) }
      : {})
  }))
}
