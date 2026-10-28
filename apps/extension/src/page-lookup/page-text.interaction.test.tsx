import { afterEach, describe, expect, it } from 'vitest'
import { hostElementName } from '../content/shadow-mount'
import { sentence, sentenceTokens } from '../test/word-cards'
import { annotate, romajiLine } from './annotate'
import { selectedPageText } from './selection'
import { toneOf } from './underline'
import { japaneseText, leftAloneIn } from './walker'
import { pageTokens } from './words'

afterEach(() => {
  document.body.replaceChildren()
})

const page = (html: string) => {
  document.body.innerHTML = html
  return document.body
}

const tokens = () => pageTokens(sentenceTokens, sentence) ?? []

const noAids = { furigana: false, romaji: false, meanings: false }

describe('the Japanese text on a page', () => {
  it('is found in what a learner reads, and not in controls, navigation, pinned bars, or Zenbu’s own', () => {
    const body = page(`
      <p id="read">要求が要る。</p><p>English only</p>
      <nav><a>要求</a></nav><div role="navigation">要求</div>
      <textarea>要求</textarea><button>要求</button><div contenteditable="true">要求</div>
      <header style="position: fixed">要求</header><ruby>要<rt>よう</rt></ruby>
      <span data-zenbu-aid="meaning">要求</span><${hostElementName}>要求</${hostElementName}>`)
    const found = japaneseText(body, leftAloneIn(window))
    expect(found.map(node => [node.parentElement?.localName, node.data])).toEqual([
      ['p', '要求が要る。'],
      ['ruby', '要']
    ])
    const read = document.getElementById('read')?.firstChild as Text
    expect(japaneseText(read, leftAloneIn(window))).toEqual([read])
  })

  it('leaves the words in labels, summaries, and ARIA controls to the page, so a click works the control', () => {
    const body = page(`
      <label id="agree"><input type="checkbox"> 利用規約に同意する</label>
      <details id="more"><summary>詳細を見る</summary><p id="inside">要求が要る。</p></details>
      ${['button', 'tab', 'menuitem', 'checkbox', 'switch', 'radio', 'option']
        .map(role => `<div role="${role}"><span>要求</span></div>`)
        .join('')}`)
    const found = japaneseText(body, leftAloneIn(window))
    expect(found.map(node => node.parentElement?.id)).toEqual(['inside'])
  })

  it('takes furigana and each word’s meaning from Zenbu when the learner turns them on', () => {
    const body = page('<p>要求が要る。</p>')
    const node = body.querySelector('p')?.firstChild as Text
    const { inserted, pieces } = annotate(
      node,
      tokens(),
      { furigana: true, romaji: false, meanings: true },
      new Map([
        ['youkyuu', 'demand'],
        ['iru', null]
      ]),
      'light'
    )
    node.remove()
    expect(inserted).toHaveLength(3)
    expect([...body.querySelectorAll('rt')].map(rt => rt.textContent)).toEqual(['ようきゅう', 'い'])
    expect(
      [...body.querySelectorAll('[data-zenbu-aid="meaning"]')].map(aid => aid.textContent)
    ).toEqual(['demand'])
    expect(pieces.map(piece => [piece.node.data, piece.token.text])).toEqual([
      ['要求', '要求'],
      ['が', 'が'],
      ['要', '要る'],
      ['る', '要る'],
      ['。', '。']
    ])
    expect(romajiLine(document).lang).toBe('ja-Latn')
  })

  it('writes the words alone when every reading aid is off', () => {
    const body = page('<p>要求が要る。</p>')
    const node = body.querySelector('p')?.firstChild as Text
    annotate(node, tokens(), noAids, new Map(), 'dark')
    node.remove()
    expect(body.querySelector('rt, [data-zenbu-aid="meaning"]')).toBeNull()
    expect(body.textContent).toBe(sentence)
  })

  it('copies a selection without the furigana, romaji, and meanings Zenbu added', () => {
    const body = page(
      '<p><ruby>要求<rt>ようきゅう</rt></ruby>が<span data-zenbu-aid="meaning">demand</span>要る<span data-zenbu-aid="romaji">youkyuu ga iru</span></p>'
    )
    const range = document.createRange()
    range.selectNodeContents(body)
    const selection = getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    expect(selectedPageText(selection)).toBe('要求が要る')
    selection?.removeAllRanges()
    expect(selectedPageText(selection)).toBe('')
  })

  it('underlines in the dark colour on a page whose text is light', () => {
    expect(toneOf('rgb(17, 24, 39)')).toBe('light')
    expect(toneOf('rgb(243, 244, 246)')).toBe('dark')
    expect(toneOf('rgb(255 255 255 / 0.8)')).toBe('dark')
    expect(toneOf('canvastext')).toBe('light')
  })
})
