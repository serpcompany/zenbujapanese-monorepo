import { fill } from '@zenbu/dictionary-core/detail/template'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { byText, click, find, openMenu, type Rendered, render, settle } from '../test/render'
import { popupAnswer, youkyuu } from '../test/word-cards'
import type { Sharing } from './copy'
import { wordPopupLabels as labels } from './labels'
import { wordAddress } from './shown'
import type { WordLookUp } from './use-cards'
import { WordPopup } from './word-popup'

const address = wordAddress(youkyuu)

let shown: Rendered | undefined

const shareButton = (popup: HTMLElement) =>
  find(popup, `button[aria-label="${fill(labels.share.share, { name: '要求' })}"]`)

afterEach(() => {
  shown?.unmount()
  shown = undefined
})

async function showPopup(
  text: string,
  ids: string[],
  { lookUp = async id => popupAnswer(id), sharing }: { lookUp?: WordLookUp; sharing?: Sharing } = {}
) {
  const openFullEntry = vi.fn()
  const close = vi.fn()
  shown = render(
    <WordPopup
      text={text}
      ids={ids}
      lookUp={lookUp}
      frequency={[]}
      romaji={false}
      openFullEntry={openFullEntry}
      close={close}
      sharing={sharing}
    />
  )
  await settle()
  const popup = find(shown.container, '[data-word-popup]')
  return { popup, openFullEntry, close, button: (name: string) => byText(popup, 'button', name) }
}

describe('the word popup', () => {
  it('shows the word’s card, takes focus, and opens its Word Detail from Open Full Entry', async () => {
    const { popup, openFullEntry, close, button } = await showPopup('要求', ['youkyuu'])
    expect(popup.getAttribute('aria-label')).toBe(fill(labels.word, { name: '要求' }))
    expect(document.activeElement).toBe(popup)
    expect(find(popup, '[data-meaning]').textContent).toContain('demand')
    await click(button(labels.openFullEntry))
    expect(openFullEntry).toHaveBeenCalledWith({ page: 'word', entSeq: 1546680 })
    await click(button(labels.close))
    expect(close).toHaveBeenCalledOnce()
  })

  it('asks which word is meant when the text has several, and offers them all to Open Full Entry', async () => {
    const { popup, openFullEntry, button } = await showPopup('要', ['kaname', 'you'])
    expect(popup.getAttribute('aria-label')).toBe(fill(labels.choose, { name: '要' }))
    const choices = [...popup.querySelectorAll('[data-choice]')]
    expect(choices.map(choice => choice.getAttribute('data-choice'))).toEqual([
      '1609600',
      '2188720'
    ])
    expect(choices[0].textContent).toContain('要【かなめ】')
    expect(popup.querySelector('[data-headword]')).toBeNull()

    await click(choices[1])
    expect(popup.getAttribute('aria-label')).toBe(fill(labels.word, { name: '要' }))
    await click(button(labels.openFullEntry))
    expect(openFullEntry).toHaveBeenCalledWith({
      page: 'word',
      entSeq: 2188720,
      entries: [1609600, 2188720]
    })
    await click(button(labels.back))
    expect(popup.querySelectorAll('[data-choice]')).toHaveLength(2)
  })

  it('says when the word isn’t in the dictionary, and when the dictionary didn’t answer', async () => {
    const missing = await showPopup('要', ['missing'])
    expect(missing.popup.textContent).toContain(labels.notFound)
    expect(missing.popup.textContent).not.toContain(labels.openFullEntry)
    shown?.unmount()

    const failing = await showPopup('要', ['youkyuu'], {
      lookUp: async () => ({ type: 'failed', reason: 'broken' })
    })
    expect(failing.popup.textContent).toContain(labels.failed)
    shown?.unmount()

    const rejecting = await showPopup('要', ['youkyuu'], {
      lookUp: () => Promise.reject(new Error('gone'))
    })
    expect(rejecting.popup.textContent).toContain(labels.failed)
  })

  it('shares the word with the share sheet where there is one', async () => {
    const share = vi.fn(async (_data: ShareData) => {})
    const { popup } = await showPopup('要求', ['youkyuu'], { sharing: { share } })
    await click(shareButton(popup))
    expect(share).toHaveBeenCalledWith({
      title: '要求',
      text: '要求【ようきゅう】\n1. demand, request\n2. requirement',
      url: address
    })
  })

  it('copies the word’s address where there is no share sheet, and from Copy Link', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    const { popup } = await showPopup('要求', ['youkyuu'], { sharing: { writeText } })
    await click(shareButton(popup))
    expect(writeText).toHaveBeenLastCalledWith(address)
    expect(find(popup, '[data-notice]').textContent).toBe(labels.share.linkCopied)

    const menu = await openMenu(popup)
    await click(byText(menu, '[role="menuitem"]', labels.share.copyLink))
    expect(writeText).toHaveBeenCalledTimes(2)
  })

  it('says the copy failed when nothing can copy', async () => {
    const writeText = vi.fn(async (_text: string) => Promise.reject(new Error('Denied.')))
    const { popup } = await showPopup('要求', ['youkyuu'], { sharing: { writeText } })
    await click(shareButton(popup))
    expect(find(popup, '[data-notice]').textContent).toBe(labels.copyFailed)
  })
})
