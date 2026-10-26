#!/usr/bin/env node

import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

const sources = new URL('../', import.meta.url)
const loaded = new Set()

registerHooks({
  resolve(specifier, context, nextResolve) {
    const written = specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)
    const resolved = nextResolve(written ? `${specifier}.ts` : specifier, context)
    if (resolved.url.startsWith(sources.href)) {
      loaded.add(fileURLToPath(resolved.url).slice(fileURLToPath(sources).length))
    }
    return resolved
  }
})

const { romajiSearchForms } = await import('../src/search/romaji-forms.ts')
const { normalizeQuery } = await import('../src/search/query.ts')

const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const { readings, texts } = JSON.parse(Buffer.concat(chunks).toString('utf8'))
const forms = readings.map(entryReadings => romajiSearchForms(entryReadings))
const folded = texts.map(text => normalizeQuery(text))
process.stdout.write(JSON.stringify({ files: [...loaded].sort(), forms, folded }))
