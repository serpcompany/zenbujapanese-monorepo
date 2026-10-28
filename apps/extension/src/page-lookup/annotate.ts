import { type Tone, underlineColors } from './underline'
import { aidAttribute } from './walker'
import { type PageToken, wordGroups } from './words'

export type Aids = { furigana: boolean; romaji: boolean; meanings: boolean }

export type Piece = { node: Text; start: number; end: number; token: PageToken }

export type Annotation = { inserted: Node[]; pieces: Piece[] }

export type Glosses = ReadonlyMap<string, string | null>

const meaningStyle = (tone: Tone) =>
  'display: block; max-width: 8em; overflow: hidden; text-overflow: ellipsis; ' +
  `white-space: nowrap; font-size: 0.7em; line-height: 1.3; color: ${underlineColors[tone]};`

const romajiStyle = 'display: block; font-size: 0.85em; opacity: 0.75;'

function aid(doc: Document, tag: string, kind: string, style?: string) {
  const element = doc.createElement(tag)
  element.setAttribute(aidAttribute, kind)
  if (style) element.setAttribute('style', style)
  return element
}

function tokenNodes(doc: Document, token: PageToken, furigana: boolean, pieces: Piece[]) {
  const segments = furigana ? token.ruby : [{ text: token.text }]
  return segments.map(({ text, reading }) => {
    const node = doc.createTextNode(text)
    pieces.push({ node, start: 0, end: text.length, token })
    if (!reading) return node
    const ruby = doc.createElement('ruby')
    const rt = doc.createElement('rt')
    rt.textContent = reading
    ruby.append(node, rt)
    return ruby
  })
}

export const glossOf = (group: readonly PageToken[], glosses: Glosses) => {
  const linked = group.find(token => token.linked !== null)?.linked
  return linked ? (glosses.get(linked) ?? null) : null
}

export function annotate(
  node: Text,
  tokens: readonly PageToken[],
  aids: Aids,
  glosses: Glosses,
  tone: Tone
): Annotation {
  const doc = node.ownerDocument
  const pieces: Piece[] = []
  const inserted = wordGroups(tokens).map(group => {
    const gloss = aids.meanings ? glossOf(group, glosses) : null
    const plain = group.every(token => token.ids.length === 0)
    const word = aid(
      doc,
      'span',
      plain ? 'text' : 'word',
      gloss
        ? 'display: inline-flex; flex-direction: column; align-items: center;'
        : plain
          ? undefined
          : 'white-space: nowrap;'
    )
    const written = group.flatMap(token => tokenNodes(doc, token, aids.furigana, pieces))
    if (!gloss) {
      word.append(...written)
      return word
    }
    const line = doc.createElement('span')
    line.setAttribute('style', 'white-space: nowrap;')
    line.append(...written)
    const meaning = aid(doc, 'span', 'meaning', meaningStyle(tone))
    meaning.textContent = gloss
    word.append(line, meaning)
    return word
  })
  node.after(...inserted)
  return { inserted, pieces }
}

export function romajiLine(doc: Document): HTMLElement {
  const line = aid(doc, 'span', 'romaji', romajiStyle)
  line.lang = 'ja-Latn'
  return line
}

const inlineDisplays = /^(inline|contents|ruby)/

export function blockOf(node: Node, view: Pick<Window, 'getComputedStyle'>): Element | null {
  let element = node.parentElement
  while (element?.parentElement && inlineDisplays.test(view.getComputedStyle(element).display)) {
    element = element.parentElement
  }
  return element
}
