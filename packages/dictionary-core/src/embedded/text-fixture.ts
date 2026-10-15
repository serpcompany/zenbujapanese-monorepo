import type { KuromojiToken } from '../examples/morphology'
import { ask, type FakeEntry, fakeHost } from './fake-host'
import type { EmbeddedToken } from './text'

export const entries: FakeEntry[] = [
  { id: 'a1', headword: '日本語', reading: 'にほんご' },
  { id: 'p1', headword: 'を', reading: 'を', partsOfSpeech: ['particle'] },
  { id: 'p2', headword: 'を', reading: 'を', partsOfSpeech: ['particle'] },
  { id: 'n1', headword: 'を', reading: 'を', partsOfSpeech: ['noun'] },
  { id: 'v1', headword: '見る', reading: 'みる', partsOfSpeech: ['ichidanVerb'] },
  { id: 'x1', headword: '見た', reading: 'みた', partsOfSpeech: ['noun'] },
  { id: 'k1', headword: '今日', reading: 'きょう', readingForms: ['こんにち'] },
  { id: 'w1', headword: 'は', reading: 'は', partsOfSpeech: ['particle'] }
]

function token(
  position: number,
  surface: string,
  pos: string,
  reading: string,
  basicForm = surface
): KuromojiToken {
  return {
    word_type: 'KNOWN',
    word_position: position,
    surface_form: surface,
    pos,
    pos_detail_1: '*',
    pos_detail_2: '*',
    pos_detail_3: '*',
    basic_form: basicForm,
    reading
  }
}

export const sentences: Record<string, KuromojiToken[]> = {
  日本語を見た: [
    token(1, '日本語', '名詞', 'ニホンゴ'),
    token(4, 'を', '助詞', 'ヲ'),
    token(5, '見', '動詞', 'ミ', '見る'),
    token(6, 'た', '助動詞', 'タ')
  ],
  今日: [token(1, '今日', '名詞', 'コンニチ')],
  今日見た: [
    token(1, '今日', '名詞', 'コンニチ'),
    token(3, '見', '動詞', 'ミ', '見る'),
    token(4, 'た', '助動詞', 'タ')
  ],
  見る: [token(1, '見る', '動詞', 'ミル')],
  '「日本語を」': [
    token(1, '「', '記号', '「'),
    token(2, '日本語', '名詞', 'ニホンゴ'),
    token(5, 'を', '助詞', 'ヲ'),
    token(6, '」', '記号', '」')
  ],
  欠けた分析: [token(1, '欠け', '動詞', 'カケ', '欠ける')],
  日本語は: [token(1, '日本語', '名詞', 'ニホンゴ'), token(4, 'は', '助詞', 'ハ')]
}

export const host = () =>
  fakeHost(entries, {
    tokenize: text => {
      if (!Object.hasOwn(sentences, text)) throw new Error(`The tokenizer has no ${text}`)
      return sentences[text]
    }
  })

export const linked = (target: ReturnType<typeof host>, request: object) =>
  ask(target, 'linkedTokens', JSON.stringify(request)) as Promise<EmbeddedToken[]>
