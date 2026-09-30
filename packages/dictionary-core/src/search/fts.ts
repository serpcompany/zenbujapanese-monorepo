export function ftsPhrase(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

export function ftsPrefix(value: string): string {
  return /^[\p{L}\p{M}\p{N}]+$/u.test(value) ? `${value}*` : ftsPhrase(value)
}
