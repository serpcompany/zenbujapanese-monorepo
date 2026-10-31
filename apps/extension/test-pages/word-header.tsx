import '../src/styles/pages.css'
import type { RubySegment } from '@zenbu/dictionary-core/detail/ruby'
import { WordHeader } from '@zenbu/ui/dictionary/word-header'
import { createRoot } from 'react-dom/client'
import { addGeist } from '../src/shared/geist'

export type HeaderWord = { headword: string; ruby: RubySegment[]; reading: string }

const text = {
  pronounce: { unsupported: 'This browser can’t speak Japanese.', withPitch: 'with pitch' },
  conjugations: { showsConjugations: 'Shows conjugations' }
}

const word: HeaderWord = JSON.parse(new URLSearchParams(location.search).get('word') ?? '{}')

addGeist()
createRoot(document.body.appendChild(document.createElement('main'))).render(
  <div className="p-4">
    <WordHeader
      {...word}
      pronounce={`Pronounce ${word.headword}`}
      pitch={null}
      partOfSpeech=""
      conjugations={false}
      text={text}
      onUnsupported={() => undefined}
      headwordSize="panel"
    />
  </div>
)
