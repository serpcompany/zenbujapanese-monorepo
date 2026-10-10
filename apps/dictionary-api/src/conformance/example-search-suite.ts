import { readSuite } from './support'

interface SuiteToken {
  surface: string
  entry?: string
  candidates?: string[]
  queryMatch?: boolean
}

export interface ExampleSearchCase {
  query: string
  covers: string
  title?: string
  count: number
  highlightedEntry?: string
  usesPrimaryEntryExamples: boolean
  ids: string[]
  shown: { id: string; japanese: string; english: string; tokens: SuiteToken[] }[]
}

interface Suite {
  artifacts: { name: string; sha256: string }[]
  tokenLimit: number
  cases: ExampleSearchCase[]
}

export const exampleSearchSuite = readSuite<Suite>('example-search')
