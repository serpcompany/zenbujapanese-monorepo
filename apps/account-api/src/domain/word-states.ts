export const wordStates = ['unknown', 'learning', 'known'] as const

export type WordState = (typeof wordStates)[number]

export const isWordState = (value: unknown): value is WordState =>
  wordStates.some(state => state === value)
