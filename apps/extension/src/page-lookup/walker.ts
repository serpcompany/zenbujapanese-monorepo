import { hostElementName } from '../content/shadow-mount'
import { hasJapanese } from './chunks'

export const aidAttribute = 'data-zenbu-aid'

const leftAlone = new Set([
  'nav',
  'input',
  'textarea',
  'select',
  'option',
  'button',
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'math',
  'rt',
  'rp',
  'iframe',
  'object',
  'canvas',
  'video',
  'audio',
  'head',
  'title',
  hostElementName
])

const pinned = new Set(['fixed', 'sticky'])

type View = Pick<Window, 'getComputedStyle'>

export type LeftAlone = (element: Element) => boolean

function editable(element: Element) {
  const value = element.getAttribute('contenteditable')
  return value !== null && value !== 'false'
}

export function leftAloneIn(view: View): LeftAlone {
  const known = new Map<Element, boolean>()
  const own = (element: Element) =>
    leftAlone.has(element.localName) ||
    element.hasAttribute(aidAttribute) ||
    element.getAttribute('role') === 'navigation' ||
    editable(element) ||
    pinned.has(view.getComputedStyle(element).position)
  const check = (element: Element): boolean => {
    const cached = known.get(element)
    if (cached !== undefined) return cached
    const parent = element.parentElement
    const found = own(element) || (parent !== null && check(parent))
    known.set(element, found)
    return found
  }
  return check
}

export function japaneseText(root: Node, skips: LeftAlone): Text[] {
  if (root.nodeType === Node.TEXT_NODE) {
    const text = root as Text
    const parent = text.parentElement
    return parent && hasJapanese(text.data) && !skips(parent) ? [text] : []
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return []
  const doc = root.ownerDocument ?? (root as Document)
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const found: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text
    const parent = text.parentElement
    if (parent && hasJapanese(text.data) && !skips(parent)) found.push(text)
  }
  return found
}

type Screen = Pick<Window, 'innerHeight' | 'innerWidth'>

function onScreen(node: Text, screen: Screen) {
  const range = node.ownerDocument.createRange()
  range.selectNodeContents(node)
  const box = range.getBoundingClientRect()
  return (
    box.width > 0 &&
    box.bottom >= 0 &&
    box.right >= 0 &&
    box.top <= screen.innerHeight &&
    box.left <= screen.innerWidth
  )
}

export function onScreenFirst(nodes: readonly Text[], screen: Screen): Text[] {
  const shown: Text[] = []
  const later: Text[] = []
  for (const node of nodes) (onScreen(node, screen) ? shown : later).push(node)
  return [...shown, ...later]
}
