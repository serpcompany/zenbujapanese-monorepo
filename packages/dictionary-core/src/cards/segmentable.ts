export const maximumSegmentedLength = 200

export function segmentationProblem(text: string): 'empty' | 'tooLong' | null {
  if (text.trim() === '') return 'empty'
  return Array.from(text).length > maximumSegmentedLength ? 'tooLong' : null
}

export const isSegmentableText = (text: string) => segmentationProblem(text) === null
