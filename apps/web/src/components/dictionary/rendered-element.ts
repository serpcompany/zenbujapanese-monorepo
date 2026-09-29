// Reads what a rendered kanji element page and a kanji page's Elements show, from their
// server-rendered HTML, into the kanji-element-detail and kanji-detail suites' shapes, for the
// rendered-page test (kanji-element.test.tsx). It parses the HTML into a DOM (happy-dom) and reads
// what a reader sees: each section's title, text, and rows, and where each row links. Test-only.

import { Window } from 'happy-dom'

/** A kanji's row as drawn, with where it links. */
export interface RenderedElementKanji {
  character: string
  meanings?: string
  readings?: string
  href: string | null
}

export interface RenderedElement {
  glyph: string
  meanings: string | null
  /** Each section's title as shown, in order. */
  sections: string[]
  /** Each alternative form, with where it links. */
  alternatives: { glyph: string; href: string | null }[]
  meaningExplanation: string | null
  soundPatterns: string | null
  standaloneKanji: RenderedElementKanji | null
  containingKanji: RenderedElementKanji[]
  structureSource: string
  metadataSource: string
  sourceNote: string
}

function parse(html: string) {
  const { document } = new Window()
  document.body.innerHTML = html
  return document
}

type Node = NonNullable<ReturnType<ReturnType<typeof parse>['querySelector']>>

const textOf = (node: Node | null) => node?.textContent?.trim() ?? null

function kanjiRow(row: Node): RenderedElementKanji {
  const meanings = textOf(row.querySelector('[data-element-kanji-meanings]'))
  const readings = textOf(row.querySelector('[data-element-kanji-readings]'))
  return {
    character: row.getAttribute('data-element-kanji') ?? '',
    ...(meanings === null ? {} : { meanings }),
    ...(readings === null ? {} : { readings }),
    href: row.tagName === 'A' ? row.getAttribute('href') : null
  }
}

/** The element page as drawn. */
export function readKanjiElement(html: string): RenderedElement {
  const document = parse(html)
  const section = (name: string) => document.querySelector(`[data-element-section="${name}"]`)
  const sectionText = (name: string) =>
    textOf(section(name)?.querySelector('[data-element-text]') ?? null)
  const rows = (name: string) =>
    [...(section(name)?.querySelectorAll('[data-element-kanji]') ?? [])].map(kanjiRow)
  return {
    glyph: textOf(document.querySelector('[data-element-glyph]')) ?? '',
    meanings: textOf(document.querySelector('[data-element-meanings]')),
    sections: [...document.querySelectorAll('[data-element-section]')].map(
      node => textOf(node.querySelector('[data-slot="card-title"]')) ?? ''
    ),
    alternatives: [...document.querySelectorAll('[data-element-alternative]')].map(node => ({
      glyph: textOf(node) ?? '',
      href: node.getAttribute('href')
    })),
    meaningExplanation: sectionText('meaningStructure'),
    soundPatterns: sectionText('soundPatterns'),
    standaloneKanji: rows('standaloneKanji')[0] ?? null,
    containingKanji: rows('containingKanji'),
    structureSource: textOf(document.querySelector('[data-element-structure-source]')) ?? '',
    metadataSource: textOf(document.querySelector('[data-element-metadata-source]')) ?? '',
    sourceNote: textOf(document.querySelector('[data-element-source-note]')) ?? ''
  }
}

/** A kanji page's Elements as drawn: each element's role, what it shows, and where it links. */
export function readKanjiElements(
  html: string
): { glyph: string; role: string; description: string; href: string | null }[] {
  const document = parse(html)
  return [...document.querySelectorAll('[data-kanji-element]')].map(row => ({
    glyph: row.getAttribute('data-kanji-element') ?? '',
    role: textOf(row.querySelector('[data-kanji-element-role]')) ?? '',
    description: textOf(row.querySelector('[data-kanji-element-description]')) ?? '',
    href: row.tagName === 'A' ? row.getAttribute('href') : null
  }))
}
