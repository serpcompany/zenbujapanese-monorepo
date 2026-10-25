import { keptWithin, plainText } from './text'

export const listLimits = {
  lists: 500,
  wordsPerList: 5000,
  position: 100_000,
  nameLength: 500
} as const

export function listName(typed: string): string | null {
  const name = plainText(typed)
  return keptWithin(name, 1, listLimits.nameLength) ? name : null
}
