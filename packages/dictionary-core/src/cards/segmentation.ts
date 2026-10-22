import type { ExampleSentenceTokenRow } from '../detail/rows'
import { type RubySegment, rubySegments } from '../detail/ruby'

export const segmentationFormat = 'zenbu.segmentation.v1'

export interface SegmentedToken extends ExampleSentenceTokenRow {
  languageReferenceID?: string
  candidates?: string[]
}

export interface SegmentationResponse {
  tokens: SegmentedToken[]
}

export function segmentationFurigana(tokens: readonly SegmentedToken[]): RubySegment[] {
  return tokens.flatMap(({ text, reading }) => (reading ? rubySegments(text, reading) : [{ text }]))
}
