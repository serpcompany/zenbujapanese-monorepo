import type { Locator, Page } from '@playwright/test'

export const phoneLimits = { smallestText: 12, narrowestGridCell: 44 }

interface PhoneLayoutProblems {
  smallText: string[]
  outsideTheViewport: string[]
  clippedText: string[]
  narrowGridCells: string[]
}

function findPhoneLayoutProblems(limits: typeof phoneLimits): PhoneLayoutProblems {
  const viewportWidth = document.documentElement.clientWidth
  const pageRoots = [document.body, document.documentElement]
  const describe = (element: Element) => {
    const text = (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
    return `<${element.tagName.toLowerCase()}> “${text}”`
  }
  const ancestors = (element: Element) => {
    const found: Element[] = []
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (pageRoots.includes(parent)) break
      found.push(parent)
    }
    return found
  }
  const visibleBoxes = (node: Node) => {
    const range = document.createRange()
    range.selectNodeContents(node)
    return [...range.getClientRects()].filter(box => box.width > 1 && box.height > 1)
  }
  const onlyForScreenReaders = (element: Element) =>
    [element, ...ancestors(element)].some(box => {
      const edges = box.getBoundingClientRect()
      return edges.width <= 1 && edges.height <= 1
    })
  const texts: { element: Element; boxes: DOMRect[] }[] = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement
    if (!element || !node.textContent?.trim()) continue
    if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
    if (onlyForScreenReaders(element)) continue
    const boxes = visibleBoxes(node)
    if (boxes.length) texts.push({ element, boxes })
  }

  const inADrawing = (element: Element) => element.closest('[aria-hidden="true"]') !== null
  const smallText = texts.flatMap(({ element }) => {
    if (inADrawing(element)) return []
    const size = Number.parseFloat(getComputedStyle(element).fontSize)
    return size < limits.smallestText ? [`${describe(element)} is ${size}px`] : []
  })

  const clipsAcross = (element: Element) => getComputedStyle(element).overflowX !== 'visible'
  const outsideTheViewport = [...document.body.querySelectorAll('*')].flatMap(element => {
    const box = element.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return []
    if (box.left >= -1 && box.right <= viewportWidth + 1) return []
    if (!element.checkVisibility({ visibilityProperty: true })) return []
    if (ancestors(element).some(clipsAcross)) return []
    return [
      `${describe(element)} spans ${Math.round(box.left)}–${Math.round(box.right)}px of ${viewportWidth}px`
    ]
  })

  const cuts = ['hidden', 'clip']
  const meantToCut = (box: Element, style: CSSStyleDeclaration) =>
    style.textOverflow === 'ellipsis' ||
    style.webkitLineClamp !== 'none' ||
    box.querySelector('[aria-roledescription="slide"]') !== null
  const cutBy = (element: Element, boxes: DOMRect[]) => {
    for (const box of [element, ...ancestors(element)]) {
      const style = getComputedStyle(box)
      if (meantToCut(box, style)) return null
      const edges = box.getBoundingClientRect()
      const across = cuts.includes(style.overflowX)
      const down = cuts.includes(style.overflowY)
      const outside = (text: DOMRect) =>
        (across && (text.left < edges.left - 1 || text.right > edges.right + 1)) ||
        (down && (text.top < edges.top - 1 || text.bottom > edges.bottom + 1))
      if (boxes.some(outside)) return box
    }
    return null
  }
  const clippedText = texts.flatMap(({ element, boxes }) => {
    if (inADrawing(element)) return []
    const box = cutBy(element, boxes)
    return box ? [`${describe(element)} is cut off by ${describe(box)}`] : []
  })

  const textElements = texts.map(({ element }) => element)
  const showsText = (cell: Element) => textElements.some(element => cell.contains(element))
  const lists = [...document.querySelectorAll('ul, ol, [role="list"], [role="grid"]')]
  const narrowGridCells = lists.flatMap(list => {
    if (!getComputedStyle(list).display.endsWith('grid') || !list.checkVisibility()) return []
    const widths = [...list.children]
      .filter(showsText)
      .map(cell => cell.getBoundingClientRect().width)
      .filter(width => width > 0)
    const narrowest = Math.min(...widths)
    if (narrowest >= limits.narrowestGridCell) return []
    const name = list.getAttribute('aria-label') ?? describe(list)
    return [`The grid “${name}” has cells ${Math.round(narrowest)}px wide`]
  })

  return {
    smallText: [...new Set(smallText)],
    outsideTheViewport,
    clippedText: [...new Set(clippedText)],
    narrowGridCells
  }
}

export const phoneLayoutProblems = (page: Page, limits = phoneLimits) =>
  page.evaluate(findPhoneLayoutProblems, limits)

export const linesOfText = (elements: Locator) =>
  elements.evaluateAll(list =>
    list.map(element => {
      const bottoms: number[] = []
      const range = document.createRange()
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (text.parentElement?.closest('rt')) continue
        range.selectNodeContents(text)
        bottoms.push(...[...range.getClientRects()].map(box => box.bottom))
      }
      const fontSize = Number.parseFloat(getComputedStyle(element).fontSize)
      const oneLine = Math.max(...bottoms) - Math.min(...bottoms) < fontSize / 2
      return { text: element.textContent, oneLine }
    })
  )
