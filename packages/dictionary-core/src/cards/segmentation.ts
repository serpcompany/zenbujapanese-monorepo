import type { ExampleSentenceTokenRow } from '../detail/rows'

export const segmentationFormat = 'zenbu.segmentation.v1'

export interface SegmentedToken extends ExampleSentenceTokenRow {
  languageReferenceID?: string
  candidates?: string[]
}
