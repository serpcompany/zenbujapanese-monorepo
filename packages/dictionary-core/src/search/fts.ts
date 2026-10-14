export function ftsPhrase(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

export function ftsPrefix(value: string): string {
  return /^[\p{L}\p{M}\p{N}]+$/u.test(value) ? `${value}*` : ftsPhrase(value)
}

const fts4QueryParserErrors = /malformed MATCH|unterminated string/i

export function isUnreadableQuery(error: unknown): boolean {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (fts4QueryParserErrors.test(cause.message)) return true
  }
  return false
}
