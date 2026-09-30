import { readFileSync } from 'node:fs'
import { type DictionaryApi, dictionaryApi } from '@/lib/dictionary/api'

// The rendered-page gate: the page tests' last cases render what a running dictionary service
// (apps/dictionary-api) answers for cases of the app-recorded suites, and compare what a reader
// sees with what the app recorded. ZENBU_DICTIONARY_API=1 turns them on; ZENBU_DICTIONARY_API_URL
// (default http://localhost:8788) and ZENBU_DICTIONARY_API_TOKEN name the service.
// docs/agents/web.md runs it.

export const gateEnabled = process.env.ZENBU_DICTIONARY_API === '1'

/** The service the gate renders from, through the website's own client. */
export function gateService(): DictionaryApi {
  const api = dictionaryApi({
    DICTIONARY_API_URL: process.env.ZENBU_DICTIONARY_API_URL ?? 'http://localhost:8788',
    DICTIONARY_API_TOKEN: process.env.ZENBU_DICTIONARY_API_TOKEN
  })
  if (!api) throw new Error('ZENBU_DICTIONARY_API_URL is empty')
  return api
}

/** An app-recorded suite's cases (apps/ios/LanguageData/Conformance); none when the gate is off. */
export function recordedCases<Case>(suite: string): Case[] {
  if (!gateEnabled) return []
  const url = new URL(`../../../../ios/LanguageData/Conformance/${suite}`, import.meta.url)
  return (JSON.parse(readFileSync(url, 'utf8')) as { cases: Case[] }).cases
}
