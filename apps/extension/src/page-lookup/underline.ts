export type Tone = 'light' | 'dark'

export const highlightNames: Record<Tone, string> = {
  light: 'zenbu-japanese-word',
  dark: 'zenbu-japanese-word-on-dark'
}

export const underlineColors: Record<Tone, string> = {
  light: 'rgb(37 99 235)',
  dark: 'rgb(96 165 250)'
}

const rule = (tone: Tone) =>
  `::highlight(${highlightNames[tone]}) { text-decoration-line: underline; ` +
  `text-decoration-thickness: 2px; text-decoration-color: ${underlineColors[tone]}; ` +
  'text-underline-offset: 0.2em; }'

export function toneOf(color: string): Tone {
  const [red, green, blue] = (color.match(/[\d.]+/g) ?? []).map(Number)
  if (blue === undefined) return 'light'
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
  return luminance > 0.5 ? 'dark' : 'light'
}

export type Underlines = {
  draw(node: Text, ranges: Range[], tone: Tone): void
  erase(node: Text): void
  stop(): void
}

export function pageUnderlines(doc: Document = document): Underlines {
  const highlights = { light: new Highlight(), dark: new Highlight() }
  const drawn = new Map<Text, { ranges: Range[]; tone: Tone }>()
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(`${rule('light')}\n${rule('dark')}`)
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet]
  CSS.highlights.set(highlightNames.light, highlights.light)
  CSS.highlights.set(highlightNames.dark, highlights.dark)
  const erase = (node: Text) => {
    const found = drawn.get(node)
    if (!found) return
    for (const range of found.ranges) highlights[found.tone].delete(range)
    drawn.delete(node)
  }
  return {
    draw(node, ranges, tone) {
      erase(node)
      if (ranges.length === 0) return
      for (const range of ranges) highlights[tone].add(range)
      drawn.set(node, { ranges, tone })
    },
    erase,
    stop() {
      drawn.clear()
      CSS.highlights.delete(highlightNames.light)
      CSS.highlights.delete(highlightNames.dark)
      doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter(adopted => adopted !== sheet)
    }
  }
}
