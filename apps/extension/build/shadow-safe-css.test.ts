import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import postcss, { type AtRule, type Node, type Root } from 'postcss'
import { preprocessCSS, resolveConfig } from 'vite'
import { beforeAll, describe, expect, it } from 'vitest'
import { extensionConfig } from './extension-config.ts'
import { remToPx, shadowSafeCss } from './shadow-safe-css.ts'

describe('remToPx', () => {
  it('turns rem lengths into pixels at the browser default of 16px', () => {
    expect(remToPx('0.25rem')).toBe('4px')
    expect(remToPx('calc(var(--spacing) * 2 + .5rem)')).toBe('calc(var(--spacing) * 2 + 8px)')
    expect(remToPx('1.125rem 2rem')).toBe('18px 32px')
    expect(remToPx('(width >= 40rem)')).toBe('(width >= 640px)')
    expect(remToPx('calc(-0.5rem - 1px)')).toBe('calc(-8px - 1px)')
  })

  it('leaves em, names, and other units alone', () => {
    expect(remToPx('1em')).toBe('1em')
    expect(remToPx('var(--text-2rem)')).toBe('var(--text-2rem)')
    expect(remToPx('12px')).toBe('12px')
  })
})

describe('shadowSafeCss', () => {
  it('unwraps the @supports guard only around the --tw-* fallback in @layer properties', async () => {
    const css = `
@layer properties {
  @supports ((-webkit-hyphens: none) and (not (margin-trim: inline))) {
    *, ::before, ::after, ::backdrop { --tw-shadow: 0 0 #0000; }
  }
}
@supports (display: grid) { .grid { display: grid; } }`
    const { root } = await postcss([shadowSafeCss()]).process(css, { from: undefined })
    const supports: string[] = []
    root.walkAtRules('supports', rule => {
      supports.push(rule.params)
    })
    expect(supports).toEqual(['(display: grid)'])
    expect(root.toString()).toContain('--tw-shadow: 0 0 #0000')
  })

  it('leaves a stylesheet it does not apply to as it was', async () => {
    const css = '.p-2 { padding: 0.5rem; }'
    const { css: output } = await postcss([
      shadowSafeCss(file => file.endsWith('shadow.css'))
    ]).process(css, { from: '/extension/src/styles/pages.css' })
    expect(output).toBe(css)
  })
})

const remLength = /(^|[\s(,*+/:-])\.?\d[\d.]*rem\b/

function ancestors(node: Node): AtRule[] {
  const found: AtRule[] = []
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule') found.push(parent as AtRule)
  }
  return found
}

async function buildStylesheet(name: string): Promise<Root> {
  const stylesheet = fileURLToPath(new URL(`../src/styles/${name}`, import.meta.url))
  const config = await resolveConfig(extensionConfig('release'), 'build')
  const { code } = await preprocessCSS(await readFile(stylesheet, 'utf8'), stylesheet, config)
  return postcss.parse(code)
}

function remLengthsIn(stylesheet: Root): string[] {
  const found: string[] = []
  stylesheet.walkDecls(declaration => {
    if (remLength.test(declaration.value)) found.push(declaration.value)
  })
  stylesheet.walkAtRules(rule => {
    if (remLength.test(rule.params)) found.push(rule.params)
  })
  return found
}

describe('the pages stylesheet as the build makes it', () => {
  it("keeps rem lengths, so the extension's own pages follow the browser's font size", async () => {
    expect(remLengthsIn(await buildStylesheet('pages.css')).length).toBeGreaterThan(0)
  }, 60_000)
})

describe('the shadow root stylesheet as the build makes it', () => {
  let built: Root

  beforeAll(async () => {
    built = await buildStylesheet('shadow.css')
  }, 60_000)

  it('has no rem length, so a page that changes its root font size cannot resize it', () => {
    expect(remLengthsIn(built)).toEqual([])
  })

  it('declares the --tw-* fallback outside any @supports, since @property does not reach a shadow root', () => {
    const fallbacks: Node[] = []
    built.walkDecls(/^--tw-/, declaration => {
      if (
        ancestors(declaration).some(rule => rule.name === 'layer' && rule.params === 'properties')
      )
        fallbacks.push(declaration)
    })
    expect(fallbacks.length).toBeGreaterThan(0)
    for (const declaration of fallbacks) {
      expect(ancestors(declaration).map(rule => rule.name)).not.toContain('supports')
    }
  })

  it('resets everything the page set on the host, and keeps the theme tokens on :host', () => {
    const selectors: string[] = []
    built.walkRules(rule => {
      selectors.push(rule.selector)
    })
    expect(built.toString()).toMatch(/:host\s*\{\s*all:\s*initial/)
    expect(
      selectors.some(selector => selector.includes(':host') && selector.includes(':root'))
    ).toBe(true)
  })
})
