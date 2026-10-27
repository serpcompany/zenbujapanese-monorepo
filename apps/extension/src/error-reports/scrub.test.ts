import type { ErrorEvent } from '@sentry/browser'
import { describe, expect, it } from 'vitest'
import { scrubEvent, scrubText } from './scrub'

const pageText = '今日は東京で雨が降っています'
const pageUrl = 'https://news.example.com/articles/2026/rain?reader=42#comments'
const selectedWord = '降っています'
const englishSelection = 'serendipity'

function eventFromAPage(): ErrorEvent {
  return {
    type: undefined,
    event_id: 'a1b2c3',
    environment: 'qa',
    release: 'zenbujapanese-extension@0.1.0',
    message: `Couldn't look up 「${selectedWord}」 on ${pageUrl}`,
    logentry: { message: `Selected "${englishSelection}" in "${pageText}"`, params: [pageText] },
    exception: {
      values: [
        {
          type: 'TypeError',
          value: `No entry for ${selectedWord} at ${pageUrl}`,
          mechanism: { type: 'onerror', handled: false, data: { url: pageUrl } },
          stacktrace: {
            frames: [
              {
                filename: pageUrl,
                abs_path: pageUrl,
                function: 'onSelection',
                context_line: `const word = "${selectedWord}"`,
                pre_context: [pageText],
                post_context: [pageText],
                vars: { word: selectedWord, text: pageText }
              },
              {
                filename: 'chrome-extension://abcdefghijklmnop/test-content-script.js',
                abs_path: 'chrome-extension://abcdefghijklmnop/test-content-script.js',
                function: 'lookUp',
                lineno: 1,
                colno: 4096
              }
            ]
          }
        }
      ]
    },
    breadcrumbs: [{ category: 'ui.click', message: pageText, data: { url: pageUrl } }],
    request: {
      url: pageUrl,
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/141.0', Referer: pageUrl }
    },
    tags: { part: 'content-script', word: selectedWord, page: pageUrl },
    extra: { selection: englishSelection, text: pageText },
    user: { id: englishSelection, ip_address: '203.0.113.9' },
    server_name: 'news.example.com',
    transaction: pageUrl,
    contexts: {
      browser: { name: 'Chrome', version: '141.0' },
      os: { name: 'macOS' },
      page: { url: pageUrl, text: pageText },
      selection: { word: selectedWord }
    },
    debug_meta: {
      images: [
        { type: 'sourcemap', code_file: pageUrl, debug_id: 'page' },
        {
          type: 'sourcemap',
          code_file: 'chrome-extension://abcdefghijklmnop/test-content-script.js',
          debug_id: 'extension'
        }
      ]
    }
  }
}

describe('scrubEvent', () => {
  it("removes the page's text, its URL, and the selected word from every part of an event", () => {
    const sent = JSON.stringify(scrubEvent(eventFromAPage()))
    for (const learnerData of [
      pageText,
      selectedWord,
      englishSelection,
      'news.example.com',
      '203.0.113.9'
    ]) {
      expect(sent).not.toContain(learnerData)
    }
  })

  it('keeps what finds the fault: the error, its extension frames, the part, the browser, and the release', () => {
    const scrubbed = scrubEvent(eventFromAPage())
    const [exception] = scrubbed.exception?.values ?? []
    expect(exception?.type).toBe('TypeError')
    expect(exception?.value).toBe('No entry for <japanese> at <url>')
    expect(exception?.mechanism).toEqual({ type: 'onerror', handled: false })
    expect(exception?.stacktrace?.frames).toEqual([
      { filename: '<page>', abs_path: '<page>', function: 'onSelection' },
      {
        filename: 'chrome-extension://abcdefghijklmnop/test-content-script.js',
        abs_path: 'chrome-extension://abcdefghijklmnop/test-content-script.js',
        function: 'lookUp',
        lineno: 1,
        colno: 4096
      }
    ])
    expect(scrubbed.message).toBe("Couldn't look up <quoted> on <url>")
    expect(scrubbed.logentry).toEqual({ message: 'Selected <quoted> in <quoted>' })
    expect(scrubbed.tags).toEqual({ part: 'content-script' })
    expect(scrubbed.request).toEqual({ headers: { 'User-Agent': 'Mozilla/5.0 Chrome/141.0' } })
    expect(Object.keys(scrubbed.contexts ?? {})).toEqual(['browser', 'os'])
    expect(scrubbed.debug_meta?.images?.map(image => image.debug_id)).toEqual(['extension'])
    expect(scrubbed.release).toBe('zenbujapanese-extension@0.1.0')
    expect(scrubbed.environment).toBe('qa')
    expect(scrubbed.breadcrumbs).toBeUndefined()
    expect(scrubbed.extra).toBeUndefined()
    expect(scrubbed.user).toBeUndefined()
  })
})

describe('scrubText', () => {
  it.each([
    ['Failed to fetch https://example.com/a?q=1', 'Failed to fetch <url>'],
    ['blob:https://example.com/0f3c could not load', 'blob:<url> could not load'],
    ['The word 食べる was selected', 'The word <japanese> was selected'],
    ['ｶﾀｶﾅ and ひらがな and 々', '<japanese> and <japanese> and <japanese>'],
    ['No entry for 𩸽', 'No entry for <japanese>'],
    ['No entry for 𠮟る', 'No entry for <japanese>'],
    ['Selected taberu, unquoted', 'Selected taberu, unquoted'],
    ['Quoted “a phrase” and 『a title』', 'Quoted <quoted> and <quoted>'],
    [
      "Cannot read properties of undefined (reading 'lookUp')",
      "Cannot read properties of undefined (reading 'lookUp')"
    ],
    ['「「「 unclosed openers', '「「「 unclosed openers']
  ])('turns %j into %j', (text, scrubbed) => {
    expect(scrubText(text)).toBe(scrubbed)
  })
})
