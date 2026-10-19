import { compareStrings, graphemes, normalizeQuery } from '../search/query'

export interface LearnerNote {
  key: string
  id: string
  text: string
  headword: string
  reading: string
}

interface NotesInSearchRequest {
  query: string
  notes: readonly LearnerNote[]
}

interface NoteExcerpt {
  before: string
  match: string
  after: string
}

interface NoteRow extends NoteExcerpt {
  key: string
  id: string
  headword: string
  reading: string
}

interface NotesInSearch {
  title: string
  rows: NoteRow[]
}

export const notesInSearchTitle = 'In your notes'
export const contextBeforeMatch = 20
export const excerptLength = 80
const ellipsis = '…'
const separatorRun = /[\p{White_Space}\u{FEFF}]+/gu
const separatorOnly = /^[\p{White_Space}\u{FEFF}]+$/u

interface FoldedPieces {
  text: string
  piece: number[]
}

function foldedPieces(pieces: readonly string[], until = Number.POSITIVE_INFINITY): FoldedPieces {
  let text = ''
  const piece: number[] = []
  let separator = -1
  for (let index = 0; index < pieces.length && text.length < until; index++) {
    const folded = normalizeQuery(pieces[index])
    if (folded === '') {
      if (text !== '' && separator < 0) separator = index
      continue
    }
    if (separator >= 0) {
      text += ' '
      piece.push(separator)
      separator = -1
    }
    text += folded
    for (let unit = 0; unit < folded.length; unit++) piece.push(index)
  }
  return { text, piece }
}

interface MatchedPieces {
  first: number
  end: number
}

const nothingMatched: MatchedPieces = { first: 0, end: 0 }

function piecesAt(byPiece: FoldedPieces, at: number, length: number): MatchedPieces {
  return { first: byPiece.piece[at], end: byPiece.piece[at + length - 1] + 1 }
}

function matchedPieces(pieces: readonly string[], folded: string, query: string): MatchedPieces {
  const at = folded.indexOf(query)
  const end = at + query.length
  const throughTheMatch = foldedPieces(pieces, end)
  const lineUp = throughTheMatch.text.length >= end && folded.startsWith(throughTheMatch.text)
  if (lineUp) return piecesAt(throughTheMatch, at, query.length)
  const whole = foldedPieces(pieces)
  const inWhole = whole.text.indexOf(query)
  if (inWhole >= 0) return piecesAt(whole, inWhole, query.length)
  return matchedWords(pieces, query)
}

function matchedWords(pieces: readonly string[], query: string): MatchedPieces {
  const words: string[] = []
  const starts: number[] = []
  let separates: boolean | undefined
  for (let index = 0; index < pieces.length; index++) {
    const separator = separatorOnly.test(pieces[index])
    if (separator !== separates) {
      words.push('')
      starts.push(index)
      separates = separator
    }
    words[words.length - 1] += pieces[index]
  }
  starts.push(pieces.length)
  const byWord = foldedPieces(words)
  const at = byWord.text.indexOf(query)
  if (at < 0) return nothingMatched
  const matched = piecesAt(byWord, at, query.length)
  return { first: starts[matched.first], end: starts[matched.end] }
}

const spaced = (text: string) => text.replace(separatorRun, ' ')

function startOfAWord(pieces: readonly string[], from: number, to: number): number {
  for (let index = from; index < to; index++) {
    if (separatorOnly.test(pieces[index])) return index + 1
  }
  return from
}

function endOfAWord(pieces: readonly string[], from: number, to: number): number {
  for (let index = to - 1; index > from; index--) {
    if (separatorOnly.test(pieces[index])) return index
  }
  return to
}

function noteExcerpt(pieces: readonly string[], matched: MatchedPieces): NoteExcerpt {
  const { first, end } = matched
  const windowStart = Math.max(0, first - contextBeforeMatch)
  const start = windowStart > 0 ? startOfAWord(pieces, windowStart, first) : 0
  const windowStop = Math.min(pieces.length, end + Math.max(0, excerptLength - (end - start)))
  const stop = windowStop < pieces.length ? endOfAWord(pieces, end, windowStop) : windowStop
  const before = spaced(pieces.slice(start, first).join('')).trimStart()
  const after = spaced(pieces.slice(end, stop).join('')).trimEnd()
  return {
    before: start > 0 ? ellipsis + before : before,
    match: spaced(pieces.slice(first, end).join('')),
    after: stop < pieces.length ? after + ellipsis : after
  }
}

function closeness(folded: string, query: string): number {
  if (folded === query) return 0
  return folded.startsWith(query) ? 1 : 2
}

interface Found {
  note: LearnerNote
  closeness: number
  row: NoteRow
}

function compareFound(lhs: Found, rhs: Found): number {
  return (
    lhs.closeness - rhs.closeness ||
    compareStrings(lhs.note.headword, rhs.note.headword) ||
    compareStrings(lhs.note.reading, rhs.note.reading) ||
    compareStrings(lhs.note.text, rhs.note.text) ||
    compareStrings(lhs.note.key, rhs.note.key) ||
    compareStrings(lhs.note.id, rhs.note.id)
  )
}

export function notesInSearch(request: NotesInSearchRequest): NotesInSearch | null {
  const query = normalizeQuery(request.query)
  if (query === '') return null
  const found: Found[] = []
  for (const note of request.notes) {
    const folded = normalizeQuery(note.text)
    if (!folded.includes(query)) continue
    const pieces = graphemes(note.text)
    const matched = matchedPieces(pieces, folded, query)
    found.push({
      note,
      closeness: closeness(folded, query),
      row: {
        key: note.key,
        id: note.id,
        headword: note.headword,
        reading: note.reading,
        ...noteExcerpt(pieces, matched)
      }
    })
  }
  if (found.length === 0) return null
  found.sort(compareFound)
  return { title: notesInSearchTitle, rows: found.map(each => each.row) }
}
