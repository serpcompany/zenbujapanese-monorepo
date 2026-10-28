import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { settingDefaults, writeSettings } from '../shared/settings'
import { startExtension } from '../test/extension'
import { click, find, openMenu, type Rendered, render, settle } from '../test/render'
import {
  notReady,
  openFullEntryButton,
  popupAnswer,
  sentence,
  sentenceAnswer
} from '../test/word-cards'
import { type SourceServices, SourceWords } from './source-words'

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

async function showSource(using: SourceServices, open = vi.fn()) {
  shown = render(<SourceWords source={sentence} services={using} open={open} />)
  await settle()
  return shown.container
}

const texts = (scope: ParentNode, selector: string) =>
  [...scope.querySelectorAll(selector)].map(found => found.textContent)

const words = (scope: ParentNode) =>
  [...scope.querySelectorAll('[data-word]')].map(word => word.getAttribute('data-word'))

const popup = () => document.querySelector('[data-word-popup]')

const press = async (target: Element) => {
  act(() => {
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  })
  await settle()
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

  it('adds each word’s short meaning when Word Meanings is on', async () => {
    const using = services()
    const container = await showSource(using)
    expect(container.querySelector('[data-aid="meaning"]')).toBeNull()
    await act(() => writeSettings({ 'readingAids.wordMeanings': true }))
    await settle()
    expect(texts(container, '[data-aid="meaning"]')).toEqual(['demand', 'be needed'])
    expect(using.popupCard).toHaveBeenCalledWith('youkyuu', [])
  })

  it('opens the word popup from a word, and Open Full Entry opens Word Detail', async () => {
    const using = services()
    const open = vi.fn()
    const container = await showSource(using, open)
    await click(find(container, '[data-word="要求"]'))
    expect(popup()?.getAttribute('aria-label')).toBe('Word 要求')
    expect(find(document, '[data-headword]').textContent).toContain('要求')
    expect(using.popupCard).toHaveBeenCalledWith(
      'youkyuu',
      settingDefaults['frequencyDictionaries.chosen']
    )
    await click(openFullEntryButton(document))
    expect(open).toHaveBeenCalledWith({ page: 'word', entSeq: 1546680 })
  })

  it('puts the popup away on a press outside it and on Escape, leaves Escape to an open menu but not a closing one, and gives focus back to the word', async () => {
    const container = await showSource(services())
    const word = find(container, '[data-word="要る"]')
    await click(word)
    await press(find(document, '[data-meaning]'))
    await press(await openMenu(document))
    expect(popup()).not.toBeNull()
    await press(document.body)
    expect(popup()).toBeNull()
    expect(document.activeElement).toBe(word)

    await click(word)
    const menu = await openMenu(document)
    await escapeOn(menu)
    expect(popup()).not.toBeNull()
    expect(document.querySelector('[role="menu"][data-open]')).toBeNull()
    const closing = document.body.appendChild(document.createElement('div'))
    closing.setAttribute('role', 'menu')
    closing.setAttribute('data-closed', '')
    await escapeOn(popup())
    closing.remove()
    expect(popup()).toBeNull()
    expect(document.activeElement).toBe(word)
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
