export const wordsThatListNothing: ReadonlySet<string> = new Set([
  'a',
  'an',
  'the',
  'of',
  'to',
  'will'
])

export interface FixedEntry {
  jmdictEntry: number
  meaning: string
}

const desu = 1628500
const datta = 2819970
const sore = 1006970
const nai = 2257550
const dekiru = 1340450
const kesshite = 1254130
const suru = 1157170

export const fixedEntries: ReadonlyMap<string, FixedEntry> = new Map([
  ['am', { jmdictEntry: desu, meaning: 'be' }],
  ['is', { jmdictEntry: desu, meaning: 'is' }],
  ['are', { jmdictEntry: desu, meaning: 'be' }],
  ['was', { jmdictEntry: datta, meaning: 'was' }],
  ['were', { jmdictEntry: datta, meaning: 'were' }],
  ['it', { jmdictEntry: sore, meaning: 'it' }],
  ['not', { jmdictEntry: nai, meaning: 'not' }],
  ['can', { jmdictEntry: dekiru, meaning: 'be able to do' }],
  ['never', { jmdictEntry: kesshite, meaning: '(not) ever' }],
  ['do', { jmdictEntry: suru, meaning: 'do' }],
  ['does', { jmdictEntry: suru, meaning: 'do' }],
  ['did', { jmdictEntry: suru, meaning: 'do' }]
])
