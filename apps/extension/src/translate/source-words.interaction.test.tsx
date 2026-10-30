import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { settingDefaults, writeSettings } from '../shared/settings'
import { startExtension } from '../test/extension'
import {
  click,
  find,
  keyClick,
  openMenu,
  pointerClick as press,
  type Rendered,
  render,
  settle
} from '../test/render'
import {
  notReady,
  openFullEntryButton,
  popupAnswer,
  sentence,
  sentenceAnswer
} from '../test/word-cards'
import { hasOpenLayer } from '../word-popup/open-layer'
import type { PagePopup, PagePopupHeard } from '../word-popup/page-popup'
import { SourceLine, type SourceServices, SourceWords } from './source-words'

type Segmented = Awaited<ReturnType<SourceServices['segment']>>

const services = (answer: Segmented = sentenceAnswer) => ({
  segment: vi.fn<SourceServices['segment']>(async () => answer),
  wait: vi.fn<SourceServices['wait']>(() => new Promise(() => {})),
  popupCard: vi.fn<SourceServices['popupCard']>(async id => popupAnswer(id))
})

let shown: Rendered | undefined

beforeEach(() => {
  startExtension()
})

afterEach(() => {
  shown?.unmount()
  shown = undefined
})

async function showSource(using: SourceServices) {
  shown = render(<SourceWords source={sentence} services={using} />)
  await settle()
  return shown.container
}

type Asked = { word: Parameters<PagePopup>[0]; heard: PagePopupHeard; close: () => void }

function onThePage() {
  const asked: Asked[] = []
  const pagePopup = vi.fn<PagePopup>((word, heard) => {
    const close = vi.fn()
    asked.push({ word, heard, close })
    return close
  })
  const onPopup = vi.fn<(open: boolean, dismiss: () => void) => void>()
  const using: SourceServices = { ...services(), pagePopup }
  const show = async () => {
    shown = render(
      <SourceLine source={sentence} settings={settingDefaults} services={using} onPopup={onPopup} />
    )
    await settle()
    return shown.container
  }
  const hear = (event: keyof PagePopupHeard, index = 0) =>
    act(async () => asked[index]?.heard[event]())
  return { asked, pagePopup, onPopup, show, hear }
}

const texts = (scope: ParentNode, selector: string) =>
  [...scope.querySelectorAll(selector)].map(found => found.textContent)

const words = (scope: ParentNode) =>
  [...scope.querySelectorAll('[data-word]')].map(word => word.getAttribute('data-word'))

const popup = () => document.querySelector('[data-word-popup]')

const outside = () => {
  const button = document.body.appendChild(document.createElement('button'))
  button.focus()
  return button
}

const escapeOn = async (target: Element | null) => {
  act(() => {
    target?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  await settle()
}

describe('the Japanese source of a translation', () => {
  it('shows each word as a button, with furigana in hiragana and the romaji line', async () => {
    const container = await showSource(services())
    expect(words(container)).toEqual(['要求', '要る'])
    expect(texts(container, 'rt')).toEqual(['ようきゅう', 'い'])
    expect(find(container, '[data-reading-aids]').getAttribute('data-furigana')).toBe('on')
    expect(find(container, '[data-aid="romaji"]').textContent).toBe('youkyuu ga iru.')
    expect(find(container, '[data-reading-aids]').getAttribute('data-romaji')).toBe('off')
  })

  it('adds each word’s short meaning when Word Meanings is on, with its full text as a tooltip', async () => {
    const using = services()
    const container = await showSource(using)
    expect(container.querySelector('[data-aid="meaning"]')).toBeNull()
    await act(() => writeSettings({ 'readingAids.wordMeanings': true }))
    await settle()
    expect(texts(container, '[data-aid="meaning"] [aria-hidden="true"]')).toEqual([
      'demand',
      'be needed'
    ])
    expect(texts(container, '[data-aid="meaning"] .sr-only')).toEqual([
      'demand, request',
      'to be needed'
    ])
    expect(
      [...container.querySelectorAll<HTMLElement>('[data-aid="meaning"]')].map(found => found.title)
    ).toEqual(['demand, request', 'to be needed'])
    expect(using.popupCard).toHaveBeenCalledWith('youkyuu', [])
  })

  it('opens the word popup under the line where nothing can show it on the page, and Open Full Entry expands it there', async () => {
    const using = services()
    const container = await showSource(using)
    await click(find(container, '[data-word="要求"]'))
    expect(popup()?.getAttribute('aria-label')).toBe('Word 要求')
    expect(find(document, '[data-headword]').textContent).toContain('要求')
    expect(using.popupCard).toHaveBeenCalledWith(
      'youkyuu',
      settingDefaults['frequencyDictionaries.chosen']
    )
    await click(openFullEntryButton(document))
    expect(popup()?.hasAttribute('data-expanded')).toBe(true)
    expect(find(document, 'section[data-entry-page]').dataset.entryPage).toBe('word')
  })

  it('opens a word’s card on the page, level with the word, and shows no card in the panel', async () => {
    const page = onThePage()
    const container = await page.show()
    const word = find(container, '[data-word="要求"]')
    await press(word)
    expect(page.asked.map(({ word }) => word)).toEqual([
      {
        text: '要求',
        ids: ['youkyuu'],
        fromBottom: window.innerHeight - word.getBoundingClientRect().top
      }
    ])
    expect(page.onPopup).toHaveBeenLastCalledWith(true, expect.any(Function))
    await page.hear('shown')
    expect(popup()).toBeNull()
    await press(outside())
    expect(page.asked[0]?.close).toHaveBeenCalledOnce()
    expect(page.onPopup).toHaveBeenLastCalledWith(false, expect.any(Function))
  })

  it('lets go of the word when the page closes its card, and puts it away on Escape with focus back on the word', async () => {
    const page = onThePage()
    const container = await page.show()
    await press(find(container, '[data-word="要る"]'))
    await page.hear('shown')
    await page.hear('closed')
    expect(page.onPopup).toHaveBeenLastCalledWith(false, expect.any(Function))
    const word = find(container, '[data-word="要求"]')
    await press(word)
    await page.hear('shown', 1)
    await escapeOn(document.body)
    expect(page.asked[1]?.close).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(word)
    expect(page.onPopup).toHaveBeenLastCalledWith(false, expect.any(Function))
  })

  it('shows the card under the line, at the popup’s size, when the page can’t show one', async () => {
    const page = onThePage()
    const container = await page.show()
    await press(find(container, '[data-word="要求"]'))
    expect(popup()).toBeNull()
    await page.hear('unavailable')
    expect(popup()?.getAttribute('aria-label')).toBe('Word 要求')
    expect(popup()?.parentElement?.closest('[data-reading-aids]')).not.toBeNull()
  })

  it.each([
    ['Enter', 'Enter'],
    ['Space', ' ']
  ] as const)('shows a word’s card in the panel, with focus in it, when %s opens it, and gives focus back to the word on Escape', async (_name, key) => {
    const page = onThePage()
    const container = await page.show()
    const word = find(container, '[data-word="要求"]')
    await keyClick(word, key)
    expect(page.pagePopup).not.toHaveBeenCalled()
    expect(popup()?.getAttribute('aria-label')).toBe('Word 要求')
    expect(popup()?.parentElement?.closest('[data-reading-aids]')).not.toBeNull()
    expect(popup()?.contains(document.activeElement)).toBe(true)
    expect(page.onPopup).toHaveBeenLastCalledWith(true, expect.any(Function))
    await escapeOn(document.activeElement)
    expect(popup()).toBeNull()
    expect(document.activeElement).toBe(word)
    expect(page.onPopup).toHaveBeenLastCalledWith(false, expect.any(Function))
  })

  it('opens a word’s card on the page from a click after a key opened one in the panel, and the other way round', async () => {
    const page = onThePage()
    const container = await page.show()
    await keyClick(find(container, '[data-word="要る"]'))
    await press(find(container, '[data-word="要求"]'))
    expect(page.asked.map(({ word }) => word.text)).toEqual(['要求'])
    await page.hear('shown')
    expect(popup()).toBeNull()
    await keyClick(find(container, '[data-word="要る"]'))
    expect(page.asked[0]?.close).toHaveBeenCalledOnce()
    expect(page.pagePopup).toHaveBeenCalledOnce()
    expect(popup()?.getAttribute('aria-label')).toBe('Word 要る')
    expect(popup()?.contains(document.activeElement)).toBe(true)
  })

  it('puts the popup away on a press outside it and leaves focus and scroll where the press put them', async () => {
    const container = await showSource(services())
    const word = find(container, '[data-word="要る"]')
    await click(word)
    await press(find(document, '[data-meaning]'))
    expect(popup()).not.toBeNull()
    const elsewhere = outside()
    const focus = vi.spyOn(word, 'focus')
    await press(elsewhere)
    expect(popup()).toBeNull()
    expect(document.activeElement).toBe(elsewhere)
    expect(focus).not.toHaveBeenCalled()
    elsewhere.remove()
  })

  it('closes only the ••• menu on a press while it is open, its backdrop included', async () => {
    const container = await showSource(services())
    await click(find(container, '[data-word="要る"]'))
    await press(await openMenu(document))
    expect(popup()).not.toBeNull()
    const backdrop = find(document, '[role="presentation"][data-base-ui-inert]')
    expect(popup()?.contains(backdrop)).toBe(false)
    await press(backdrop)
    expect(hasOpenLayer(document)).toBe(false)
    expect(popup()).not.toBeNull()
  })

  it('puts the popup away on Escape, leaves Escape to an open menu but not a closing one, and gives focus back to the word without scrolling', async () => {
    const container = await showSource(services())
    const word = find(container, '[data-word="要る"]')
    await click(word)
    const menu = await openMenu(document)
    await escapeOn(menu)
    expect(popup()).not.toBeNull()
    expect(hasOpenLayer(document)).toBe(false)
    const closing = document.body.appendChild(document.createElement('div'))
    closing.setAttribute('role', 'menu')
    closing.setAttribute('data-closed', '')
    const focus = vi.spyOn(word, 'focus')
    await escapeOn(popup())
    closing.remove()
    expect(popup()).toBeNull()
    expect(document.activeElement).toBe(word)
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('stays plain text while the dictionary isn’t ready, and links its words once it is', async () => {
    const using = services(notReady)
    const resumes: (() => void)[] = []
    using.wait.mockImplementation(() => new Promise(go => resumes.push(go)))
    const container = await showSource(using)
    expect(find(container, '[data-source]').textContent).toBe(sentence)
    expect(container.querySelector('[data-word]')).toBeNull()
    expect(using.wait).toHaveBeenLastCalledWith(2000)

    await act(async () => resumes.shift()?.())
    await settle()
    expect(using.wait).toHaveBeenLastCalledWith(4000)
    expect(container.querySelector('[data-word]')).toBeNull()

    using.segment.mockResolvedValue(sentenceAnswer)
    await act(async () => resumes.shift()?.())
    await settle()
    expect(words(container)).toEqual(['要求', '要る'])
  })

  it('stops asking the dictionary once the card goes away', async () => {
    const using = services(notReady)
    let resume = () => {}
    using.wait.mockImplementation(() => new Promise<void>(go => (resume = go)))
    await showSource(using)
    expect(using.segment).toHaveBeenCalledTimes(1)
    shown?.unmount()
    shown = undefined
    resume()
    await settle()
    expect(using.segment).toHaveBeenCalledTimes(1)
  })
})
