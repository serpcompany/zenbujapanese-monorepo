import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { WordHeader } from './word-header'

const text = {
  pronounce: { unsupported: 'This browser can’t speak Japanese.', withPitch: 'with pitch' },
  conjugations: { showsConjugations: 'Shows conjugations' }
}

const header = (headwordSize?: 'page' | 'panel') =>
  renderToStaticMarkup(
    <WordHeader
      headword="食べる"
      ruby={[{ text: '食', reading: 'た' }, { text: 'べる' }]}
      reading="たべる"
      pronounce="Pronounce 食べる"
      pitch={null}
      partOfSpeech=""
      conjugations={false}
      text={text}
      onUnsupported={() => undefined}
      headwordSize={headwordSize}
    />
  )

const headwordClass = (markup: string) =>
  /<h1[^>]*><[a-z]+[^>]*? class="([^"]*)"/.exec(markup)?.[1] ?? ''

describe('WordHeader', () => {
  test('draws the headword at the website’s size unless asked for the panel’s', () => {
    expect(headwordClass(header())).toContain('text-5xl')
    expect(headwordClass(header('panel'))).toContain('text-4xl')
    expect(headwordClass(header('panel'))).not.toContain('text-5xl')
  })
})
