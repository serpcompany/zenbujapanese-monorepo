import { describe, expect, test } from 'vitest'
import { htmlText, visibleText, withoutScreenReaderText } from './rendered'
import { readExamples } from './rendered-word'

// The one text extractor every rendered-page reader uses must never leave a tag behind, however
// the markup nests, so a test can't be fooled into reading markup as text.

describe('htmlText, the rendered-page readers’ text extractor', () => {
  test.each([
    '<scr<script>ipt>alert(1)</script>',
    '<<b>b>bold</b>',
    '<img src=x onerror=alert(1)',
    'a < b',
    '<rt>ふりがな</rt><scr<rt>x</rt>ipt>'
  ])('leaves no < in %s', html => {
    expect(htmlText(html)).not.toContain('<')
    expect(htmlText(html, { furigana: true })).not.toContain('<')
    expect(visibleText(html)).not.toContain('<')
  })

  test('keeps encoded brackets encoded, and decodes quotes and ampersands', () => {
    expect(htmlText('<p>&lt;b&gt; &quot;a&quot; &#x27;b&#x27; &amp; c</p>')).toBe(
      `&lt;b&gt; "a" 'b' & c`
    )
  })

  test('leaves out furigana unless asked, and keeps spaces as written', () => {
    const html = '<ruby>見<rt>み</rt></ruby><span>る </span>'
    expect(htmlText(html)).toBe('見る ')
    expect(htmlText(html, { furigana: true })).toBe('見みる ')
  })

  test('screen-reader text is removed until none remains', () => {
    const nested = '<span class="sr-only"><span class="sr-only">hidden</span></span>shown</span>'
    expect(visibleText(withoutScreenReaderText(nested))).not.toContain('hidden')
  })

  test('an example’s words read as text, never as markup', () => {
    const html =
      '<ul><li data-example-pair="ab"><div><p lang="ja"><span lang="ja"><span>&lt;scr&lt;script&gt;ipt&gt;</span></span></p></div></li></ul>'
    const [example] = readExamples(html)
    expect(example.tokens.map(token => token.surface).join('')).not.toContain('<')
  })
})
