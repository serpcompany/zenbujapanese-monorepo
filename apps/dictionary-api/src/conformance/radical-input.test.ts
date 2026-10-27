import type { Dictionary, SearchResponse } from '@zenbu/dictionary-core/artifact/dictionary'
import { fixtureLeadingEntries, fixtureSearchOrder } from '@zenbu/dictionary-core/fixtures'
import { listedResults } from '@zenbu/dictionary-core/results/results'
import {
  type RadicalFile,
  RadicalLookup,
  type RadicalPanel
} from '@zenbu/dictionary-core/search/radicals'
import type { Hono } from 'hono'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import { createApp } from '../app'
import { inProcessService } from '../service'
import { appResultsScreen, type Embedded, embedded } from './embedded-support'
import { info } from './fake-service'
import { artifactAvailable, artifactRadicals, browse, dictionary } from './support'

const token = 'service-token-0123456789'

const offered = (panel: RadicalPanel) =>
  panel.groups.flatMap(group => group.radicals.map(radical => radical.id))

describe.runIf(artifactAvailable)('radical input on the app’s data', () => {
  let service: Dictionary
  let app: Hono
  let theApp: Embedded

  beforeAll(async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    service = await dictionary({ morphology: false })
    app = createApp({
      service: inProcessService(service, await browse(), info, await artifactRadicals()),
      token,
      ready: () => true
    })
    theApp = await embedded()
  })

  const answer = async <Answer>(path: string): Promise<Answer> => {
    const response = await app.request(
      new Request(`http://localhost${path}`, { headers: { authorization: `Bearer ${token}` } })
    )
    expect(response.status, path).toBe(200)
    return (await response.json()) as Answer
  }

  const rowsOf = async (path: string) => {
    const { screen } = await answer<SearchResponse>(path)
    if (screen.state !== 'results') throw new Error(`${path} found nothing`)
    return screen
  }

  test('the website’s panel, from the service’s radicals, is the app’s for every radical and a pair with each', async () => {
    const website = new RadicalLookup(await answer<RadicalFile>('/v1/radicals'))
    const every = offered(website.panel([]))
    expect(every).toHaveLength(253)
    const pairs = every.map(radical => {
      const still = offered(website.panel([radical])).filter(other => other !== radical)
      return still.length > 0 ? [radical, still[still.length - 1]] : [radical]
    })
    for (const picked of [[], ...every.map(radical => [radical]), ...pairs]) {
      const theAppShows = await theApp.presentation<RadicalPanel>('radicalPanel', picked)
      expect(website.panel(picked), picked.join(' ')).toEqual(theAppShows)
    }
  })

  test.each([
    '日',
    '見',
    '上',
    '要',
    '腰'
  ])('a picked %s lists only its leading words, as the app lists them', async kanji => {
    const path = `/v1/search/${encodeURIComponent(kanji)}`
    const typed = await rowsOf(path)
    const picked = await rowsOf(`${path}?picked=1`)
    const results = await service.searchResults(kanji)
    const leading = listedResults(results).items.slice(0, results.leadingLexicalEntryCount)
    expect(picked.rows.length).toBeLessThan(typed.rows.length)
    expect(picked.rows.map(row => row.id).sort()).toEqual(leading.map(item => item.id).sort())
    expect([picked.kanji, picked.examples]).toEqual([typed.kanji, typed.examples])
    const { screen } = await appResultsScreen(theApp, kanji, { pickedKanji: true })
    if (screen.state !== 'results') throw new Error(`The app found nothing for ${kanji}`)
    expect(picked.rows.map(row => row.id)).toEqual(screen.rows.map(row => row.id))
  })

  test('a picked word of more than one kanji lists every word, as typed', async () => {
    const path = `/v1/search/${encodeURIComponent('日本')}`
    expect((await rowsOf(`${path}?picked=1`)).rows).toEqual((await rowsOf(path)).rows)
  })

  test('the fixtures lead each one-kanji search with the dictionary’s leading words', async () => {
    for (const [query, leading] of Object.entries(fixtureLeadingEntries)) {
      const results = await service.searchResults(query)
      expect(results.leadingLexicalEntryCount, query).toBe(leading)
      if (Array.from(query).length !== 1) continue
      expect(fixtureSearchOrder[query].slice(0, leading), query).toEqual(
        results.items.slice(0, leading).map(item => item.entry.sourceRecordId)
      )
    }
  })
})
