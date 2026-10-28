import { afterEach, describe, expect, it, vi } from 'vitest'
import { readPageSelection } from '../page-lookup/messages'
import { readSelection } from './selection'

type Page = { panel?: string; page?: string | Error; pageScript?: string }

function selecting({ panel = '', page = '', pageScript }: Page) {
  vi.stubGlobal('getSelection', () => ({ toString: () => panel }))
  const executeScript = vi.fn(async ({ func }: { func: () => string }) => {
    if (page instanceof Error) throw page
    vi.stubGlobal('getSelection', () => ({ toString: () => page }))
    return [{ result: func() }]
  })
  const sendMessage = vi.fn(async () => {
    if (pageScript === undefined) throw new Error('Receiving end does not exist.')
    return { selection: pageScript }
  })
  vi.stubGlobal('chrome', {
    tabs: { query: vi.fn(async () => [{ id: 7 }]), sendMessage },
    scripting: { executeScript }
  })
  return { executeScript, sendMessage }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readSelection', () => {
  it('takes the text selected in the panel itself first', async () => {
    const { executeScript, sendMessage } = selecting({ panel: ' トイレはどこですか ', page: '駅' })
    await expect(readSelection()).resolves.toBe('トイレはどこですか')
    expect(sendMessage).not.toHaveBeenCalled()
    expect(executeScript).not.toHaveBeenCalled()
  })

  it('asks the page script on the active tab, which leaves out the reading aids it added', async () => {
    const { executeScript, sendMessage } = selecting({
      page: '要求ようきゅうが要る',
      pageScript: ' 要求が要る\n'
    })
    await expect(readSelection()).resolves.toBe('要求が要る')
    expect(sendMessage).toHaveBeenCalledWith(7, readPageSelection)
    expect(executeScript).not.toHaveBeenCalled()
  })

  it('reads the active tab itself where the page script doesn’t run', async () => {
    const { executeScript } = selecting({ page: '\n駅まで歩いて何分ですか？ ' })
    await expect(readSelection()).resolves.toBe('駅まで歩いて何分ですか？')
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 7 } }))
  })

  it('answers empty when nothing is selected', async () => {
    selecting({ pageScript: '' })
    await expect(readSelection()).resolves.toBe('')
  })

  it('answers null when the page cannot be read', async () => {
    selecting({ page: new Error('Cannot access contents of the page.') })
    await expect(readSelection()).resolves.toBeNull()
  })
})
