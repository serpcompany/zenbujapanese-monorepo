import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { settingDefaults, writeSettings } from '../shared/settings'
import { startExtension } from '../test/extension'
import { click, find, type Rendered, render, settle } from '../test/render'
import { notReady, popupAnswer, sentence, sentenceAnswer } from '../test/word-cards'
import { wordPopupLabels as labels } from '../word-popup/labels'
import { type SourceServices, SourceWords } from './source-words'

type Segmented = Awaited<ReturnType<SourceServices['segment']>>

const services = (answer: Segmented = sentenceAnswer) => ({
  segment: vi.fn<SourceServices['segment']>(async () => answer),
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

const popup = () => document.querySelector('[data-word-popup]')

const button = (scope: ParentNode, name: string) => {
  const found = [...scope.querySelectorAll('button')].find(
    element => element.textContent?.trim() === name
  )
  if (!found) throw new Error(`No button says ${name}.`)
  return found
}

describe('the Japanese source of a translation', () => {
  it('shows each word as a button, with furigana in hiragana and the romaji line', async () => {
    const container = await showSource(services())
    expect(
      [...container.querySelectorAll('[data-word]')].map(word => word.getAttribute('data-word'))
    ).toEqual(['要求', '要る'])
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
    await click(button(document, labels.openFullEntry))
    expect(open).toHaveBeenCalledWith({ page: 'word', entSeq: 1546680 })
  })

  it('puts the popup away on Close and on Escape, and gives focus back to the word', async () => {
    const container = await showSource(services())
    const word = find(container, '[data-word="要る"]')
    await click(word)
    await click(button(document, labels.close))
    expect(popup()).toBeNull()
    expect(document.activeElement).toBe(word)

    await click(word)
    act(() => {
      popup()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    await settle()
    expect(popup()).toBeNull()
    expect(document.activeElement).toBe(word)
  })

  it('stays plain text while the dictionary isn’t ready', async () => {
    const container = await showSource(services(notReady))
    expect(find(container, '[data-source]').textContent).toBe(sentence)
    expect(container.querySelector('[data-word]')).toBeNull()
  })
})
