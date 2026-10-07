import { readFileSync } from 'node:fs'
import { type DictionaryApi, dictionaryApi } from '@/lib/dictionary/api'

export const gateEnabled = process.env.ZENBU_DICTIONARY_API === '1'

export function gateService(): DictionaryApi {
  const api = dictionaryApi({
    DICTIONARY_API_URL: process.env.ZENBU_DICTIONARY_API_URL ?? 'http://localhost:8788',
    DICTIONARY_API_TOKEN: process.env.ZENBU_DICTIONARY_API_TOKEN
  })
  if (!api) throw new Error('ZENBU_DICTIONARY_API_URL is empty')
  return api
}

export function recordedCases<Case>(suite: string): Case[] {
  if (!gateEnabled) return []
  const url = new URL(`../../../ios/LanguageData/Conformance/${suite}`, import.meta.url)
  return (JSON.parse(readFileSync(url, 'utf8')) as { cases: Case[] }).cases
}
