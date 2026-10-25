import { hasInvisibleCharacters, isBlank, keptWithin } from './text'

export const profileLimits = { nameLength: 100, usernameLength: { min: 3, max: 30 } } as const

const { min, max } = profileLimits.usernameLength
const usernamePattern = new RegExp(`^[a-z0-9_]{${min},${max}}$`)
const spacesInside = /[^\S\u{FEFF}]+/gu

export const nameRule = `A name is 1 to ${profileLimits.nameLength} characters, with no control characters.`

export const usernameRule = `A username is ${min} to ${max} letters a to z, digits, or underscores.`

export function accountName(typed: string): string | null {
  const name = typed.normalize('NFC').trim().replace(spacesInside, ' ')
  return keptWithin(name, 1, profileLimits.nameLength) && !hasInvisibleCharacters(name)
    ? name
    : null
}

export function accountUsername(typed: string): string | null {
  const username = typed.normalize('NFKC').trim().toLowerCase()
  return usernamePattern.test(username) ? username : null
}

export const removesTheUsername = isBlank

export const usernameToSave = (typed: string): string | null =>
  removesTheUsername(typed) ? '' : accountUsername(typed)
