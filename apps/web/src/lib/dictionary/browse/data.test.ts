import { afterEach, expect, test, vi } from 'vitest'
import { dictionaryService } from '../data'
import { getBrowseSummaryIfAvailable } from './data'

vi.mock('../data', () => ({ dictionaryService: vi.fn() }))

afterEach(() => {
  vi.restoreAllMocks()
})

test('the home’s browse sections come from the fixtures without a service', async () => {
  vi.mocked(dictionaryService).mockResolvedValue(null)
  const summary = await getBrowseSummaryIfAvailable()
  expect(summary?.entries).toBeGreaterThan(0)
  expect(summary?.commonWords.some(word => word.path === null)).toBe(true)
})

test('the home leaves its browse sections out, and logs why, when the service can’t answer', async () => {
  const logged = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.mocked(dictionaryService).mockResolvedValue({
    browse: async () => {
      throw new Error('The dictionary service answered 502 for /v1/browse')
    }
  } as never)
  expect(await getBrowseSummaryIfAvailable()).toBeNull()
  expect(logged).toHaveBeenCalledWith(expect.stringContaining('browse_summary_unavailable'))
})
