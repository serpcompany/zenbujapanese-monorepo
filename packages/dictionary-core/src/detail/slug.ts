export function wordSlug(headword: string, reading: string): string {
  const slug = headword
    .normalize('NFC')
    .replace(/[/?#%\\\s]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return slug || reading
}
