import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSelection } from './selection'

function selecting({ panel = '', page = '' }: { panel?: string; page?: string | Error }) {
  vi.stubGlobal('getSelection', () => ({ toString: () => panel }))
  const executeScript = vi.fn(async ({ func }: { func: () => string }) => {
    if (page instanceof Error) throw page
    vi.stubGlobal('getSelection', () => ({ toString: () => page }))
    return [{ result: func() }]
  })
  vi.stubGlobal('chrome', {
    tabs: { query: vi.fn(async () => [{ id: 7 }]) },
    scripting: { executeScript }
  })
  return { executeScript }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readSelection', () => {
  it('takes the text selected in the panel itself first', async () => {
    const { executeScript } = selecting({ panel: ' トイレはどこですか ', page: '駅' })
    await expect(readSelection()).resolves.toBe('トイレはどこですか')
    expect(executeScript).not.toHaveBeenCalled()
  })

  it('otherwise takes the text selected on the active tab', async () => {
    const { executeScript } = selecting({ page: '\n駅まで歩いて何分ですか？ ' })
    await expect(readSelection()).resolves.toBe('駅まで歩いて何分ですか？')
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 7 } }))
  })

  it('answers empty when nothing is selected', async () => {
    selecting({})
    await expect(readSelection()).resolves.toBe('')
  })

  it('answers null when the page cannot be read', async () => {
    selecting({ page: new Error('Cannot access contents of the page.') })
    await expect(readSelection()).resolves.toBeNull()
  })
})
