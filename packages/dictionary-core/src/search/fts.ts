// The app's full-text match strings for the artifact's FTS4 indexes (`ftsPhrase` and `ftsPrefix`
// in apps/ios/Modules/Sources/SearchExperience/LookupClient.swift). The core queries those
// indexes directly (ADR 0009), so these are the app's strings, unchanged.
// Change the Swift and this port in the same PR (issue 481); the Search parity workflow checks it.

/** `ftsPhrase(value)`: `value` in quotes, with each inner quote doubled. */
export function ftsPhrase(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

/**
 * `ftsPrefix(value)`: a bare prefix query when `value` is one run of letters, marks, and numbers
 * (CharacterSet.alphanumerics), otherwise its phrase.
 */
export function ftsPrefix(value: string): string {
  return /^[\p{L}\p{M}\p{N}]+$/u.test(value) ? `${value}*` : ftsPhrase(value)
}
