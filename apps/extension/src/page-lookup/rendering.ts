import {
  type Aids,
  type Annotation,
  annotate,
  blockOf,
  type Glosses,
  type Piece,
  romajiLine
} from './annotate'
import { toneOf, type Underlines } from './underline'
import type { PageToken } from './words'

export type Found = { text: string; tokens: PageToken[]; romaji: string | null }

type Tracked = Found & { annotation: Annotation | null; block: Element | null }

type Block = { line: HTMLElement; members: Set<Text> }

export type Rendering = {
  has(node: Text): boolean
  nodes(): Text[]
  wordIds(): string[]
  add(node: Text, found: Found): void
  forget(node: Text, restore?: boolean): void
  redraw(): void
  clear(): void
  wordAt(x: number, y: number): Piece | null
}

type Options = {
  doc: Document
  view: Pick<Window, 'getComputedStyle'>
  underlines: Underlines
  aids: () => Aids
  glosses: Glosses
  quiet: (change: () => void) => void
}

const needsWords = (tokens: readonly PageToken[], aids: Aids, glosses: Glosses) =>
  (aids.furigana && tokens.some(token => token.ruby.some(segment => segment.reading))) ||
  (aids.meanings && tokens.some(token => token.linked !== null && glosses.get(token.linked)))

export const wordIds = (tokens: readonly PageToken[]) =>
  tokens.flatMap(token => (token.linked === null ? [] : [token.linked]))

const readingAt = (node: Node) =>
  (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)?.closest('rt')

const inDocumentOrder = (left: Node, right: Node) =>
  left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1

export function pageRendering({ doc, view, underlines, aids, glosses, quiet }: Options): Rendering {
  const tracked = new Map<Text, Tracked>()
  const pieces = new Map<Text, Piece[]>()
  const blocks = new Map<Element, Block>()

  const rangeOf = (piece: Piece) => {
    const range = doc.createRange()
    range.setStart(piece.node, piece.start)
    range.setEnd(piece.node, piece.end)
    return range
  }

  const underline = (node: Text, placed: Piece[], color: string) => {
    pieces.set(node, placed)
    const linked = placed.filter(piece => piece.token.ids.length > 0)
    underlines.draw(node, linked.map(rangeOf), toneOf(color))
  }

  const refreshBlock = (element: Element) => {
    const block = blocks.get(element)
    if (!block) return
    const said = [...block.members]
      .filter(member => tracked.has(member))
      .sort(inDocumentOrder)
      .flatMap(member => tracked.get(member)?.romaji ?? [])
    quiet(() => {
      if (said.length === 0) {
        block.line.remove()
        blocks.delete(element)
        return
      }
      block.line.textContent = said.join(' ')
      if (block.line.parentElement !== element) element.append(block.line)
    })
  }

  const draw = (node: Text, entry: Tracked) => {
    const shown = aids()
    const color = view.getComputedStyle(node.parentElement ?? doc.documentElement).color
    if (needsWords(entry.tokens, shown, glosses)) {
      quiet(() => {
        node.data = ''
        entry.annotation = annotate(node, entry.tokens, shown, glosses)
      })
      for (const piece of entry.annotation?.pieces ?? []) underline(piece.node, [piece], color)
    } else {
      underline(
        node,
        entry.tokens.map(token => ({ node, start: token.start, end: token.end, token })),
        color
      )
    }
    if (!shown.romaji || entry.romaji === null) return
    entry.block = blockOf(node, view)
    if (!entry.block) return
    const block = blocks.get(entry.block) ?? { line: romajiLine(doc), members: new Set<Text>() }
    block.members.add(node)
    blocks.set(entry.block, block)
    refreshBlock(entry.block)
  }

  const erase = (node: Text, entry: Tracked, restore = true) => {
    const { annotation, block } = entry
    for (const piece of annotation?.pieces ?? []) {
      underlines.erase(piece.node)
      pieces.delete(piece.node)
    }
    underlines.erase(node)
    pieces.delete(node)
    if (annotation) {
      quiet(() => {
        for (const inserted of annotation.inserted) inserted.parentNode?.removeChild(inserted)
        if (restore) node.data = entry.text
      })
    }
    entry.annotation = null
    entry.block = null
    if (block) {
      blocks.get(block)?.members.delete(node)
      refreshBlock(block)
    }
  }

  return {
    has: node => tracked.has(node),
    nodes: () => [...tracked.keys()],
    wordIds: () => [...new Set([...tracked.values()].flatMap(entry => wordIds(entry.tokens)))],
    add(node, found) {
      const known = tracked.get(node)
      if (known) erase(node, known)
      const entry: Tracked = { ...found, annotation: null, block: null }
      tracked.set(node, entry)
      draw(node, entry)
    },
    forget(node, restore) {
      const entry = tracked.get(node)
      if (!entry) return
      tracked.delete(node)
      erase(node, entry, restore)
    },
    redraw() {
      for (const [node, entry] of tracked) erase(node, entry)
      for (const [node, entry] of tracked) draw(node, entry)
    },
    clear() {
      for (const [node, entry] of tracked) erase(node, entry)
      tracked.clear()
    },
    wordAt(x, y) {
      const caret = doc.caretPositionFromPoint?.(x, y)
      if (!caret) return null
      const holds = (boxes: Iterable<DOMRect>) =>
        [...boxes].some(box => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)
      const reading = readingAt(caret.offsetNode)
      if (reading) {
        const base = pieces.get(reading.parentElement?.firstChild as Text)
        const word = base?.find(piece => piece.token.ids.length > 0)
        return word && holds(reading.getClientRects()) ? word : null
      }
      return (
        pieces
          .get(caret.offsetNode as Text)
          ?.find(
            piece =>
              piece.token.ids.length > 0 &&
              piece.start <= caret.offset &&
              caret.offset <= piece.end &&
              holds(rangeOf(piece).getClientRects())
          ) ?? null
      )
    }
  }
}

export const anchorOf = (doc: Document, piece: Piece) => () => {
  const range = doc.createRange()
  range.setStart(piece.node, Math.min(piece.start, piece.node.length))
  range.setEnd(piece.node, Math.min(piece.end, piece.node.length))
  return range.getBoundingClientRect()
}
