import { describe, expect, it } from 'vitest'
import { pageAt } from './active-site'

describe('pageAt', () => {
  it('names a web page by its host and asks for its origin', () => {
    expect(pageAt('https://www3.nhk.or.jp/news/easy/k10014.html')).toEqual({
      host: 'www3.nhk.or.jp',
      origins: ['https://www3.nhk.or.jp/*']
    })
    expect(pageAt('http://localhost:5173/hostile.html')).toEqual({
      host: 'localhost',
      origins: ['http://localhost/*']
    })
  })

  it('finds nothing where Chrome keeps extensions out', () => {
    for (const address of [
      'chrome://extensions/',
      'chrome-extension://abc/pages/settings.html',
      'about:blank',
      'file:///Users/learner/notes.html',
      'https://chromewebstore.google.com/detail/zenbu/abc',
      'https://chrome.google.com/webstore/detail/abc',
      'not a url'
    ]) {
      expect(pageAt(address)).toBeNull()
    }
  })
})
