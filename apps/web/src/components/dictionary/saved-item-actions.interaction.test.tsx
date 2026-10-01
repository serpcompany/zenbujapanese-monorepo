import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SavedItemActions } from './saved-item-actions'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const wordPage = 'https://zenbujapanese.com/dictionary/%E8%A6%81%E3%82%8B-1546640/'
const kanjiSearch = 'https://zenbujapanese.com/dictionary/search/%E8%A6%81/'
const shareText = '要【ヨウ、い.る、かなめ、とし】\nneed, main point, essence, pivot, key to'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(wordPage)
  document.body.innerHTML = '<div id="root"></div>'
  container = document.getElementById('root') as HTMLDivElement
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

function button(name: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
  if (!found) throw new Error(`No button named ${name}`)
  return found
}

function renderKanjiActions() {
  act(() =>
    root.render(
      <SavedItemActions
        title="要"
        shareText={shareText}
        path="/dictionary/search/%E8%A6%81/"
        name="要"
      />
    )
  )
}

function stubNavigator(share: ((data: ShareData) => Promise<void>) | undefined) {
  const writeText = vi.fn(async (_text: string) => {})
  vi.stubGlobal('navigator', { ...navigator, share, clipboard: { writeText } })
  return writeText
}

describe("a kanji's Share", () => {
  test('sends the kanji, its share text, and its search page, not the page it is on', async () => {
    const share = vi.fn(async (_data: ShareData) => {})
    stubNavigator(share)
    renderKanjiActions()
    await act(async () => button('Share 要').click())
    expect(share).toHaveBeenCalledWith({ title: '要', text: shareText, url: kanjiSearch })
  })

  test("copies the kanji's search page where the browser has no share sheet", async () => {
    const writeText = stubNavigator(undefined)
    renderKanjiActions()
    await act(async () => button('Share 要').click())
    expect(writeText).toHaveBeenCalledWith(kanjiSearch)
  })

  test('names its buttons for the kanji, so each kanji on a page has its own', () => {
    stubNavigator(undefined)
    renderKanjiActions()
    expect(button('Share 要')).toBeTruthy()
    expect(button('More actions for 要')).toBeTruthy()
  })
})

describe("a page's Share", () => {
  test('sends the page it is on', async () => {
    const share = vi.fn(async (_data: ShareData) => {})
    stubNavigator(share)
    act(() => root.render(<SavedItemActions title="要る" shareText="要る【いる】" />))
    await act(async () => button('Share').click())
    expect(share).toHaveBeenCalledWith({ title: '要る', text: '要る【いる】', url: wordPage })
  })
})
