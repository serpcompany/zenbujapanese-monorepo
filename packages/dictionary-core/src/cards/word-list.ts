export type WordQuery = { languageReferenceID: string } | { headword: string; reading: string }

const languageReferenceIdPattern = /^[0-9a-f]{32}$/

export const isLanguageReferenceId = (value: string) => languageReferenceIdPattern.test(value)

interface WordListLine {
  line: number
  text: string
}

export interface WordList {
  queries: WordQuery[]
  unreadable: WordListLine[]
}

export function parseWordList(text: string): WordList {
  const queries: WordQuery[] = []
  const unreadable: WordListLine[] = []
  text.split(/\r?\n/).forEach((raw, index) => {
    const fields = raw.split('\t').map(field => field.trim())
    if (fields.every(field => field === '')) return
    const [first, second] = fields
    if (fields.length === 1 && isLanguageReferenceId(first.toLowerCase())) {
      queries.push({ languageReferenceID: first.toLowerCase() })
    } else if (fields.length === 2 && first !== '' && second !== '') {
      queries.push({ headword: first, reading: second })
    } else {
      unreadable.push({ line: index + 1, text: raw })
    }
  })
  return { queries, unreadable }
}
