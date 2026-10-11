import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { gunzipSync, gzipSync } from 'node:zlib'
import { type IpadicFile, ipadicTokenizer } from '@zenbu/dictionary-core/examples/ipadic'
import { fixtureDictionary, fixtureFiles } from '@zenbu/dictionary-core/examples/ipadic.fixture'
import type { KuromojiToken, Tokenize } from '@zenbu/dictionary-core/examples/morphology'
import { describe, expect, test } from 'vitest'
import { artifactAvailable, artifactDatabase, artifactTokenize, resources } from './support'

const directory = join(resources, 'Kuromoji')
const fields = [
  'word_type',
  'word_position',
  'surface_form',
  'pos',
  'pos_detail_1',
  'pos_detail_2',
  'pos_detail_3',
  'basic_form',
  'reading'
] as const

function kuromoji(file: (name: string) => Uint8Array | undefined): Tokenize {
  const context = vm.createContext({
    read: (name: string) => {
      const bytes = file(name)
      return bytes && bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    }
  })
  vm.runInContext(
    `class Request {
      open(_method, url) { this.url = url }
      send() {
        this.response = read(this.url.split('/').pop())
        this.status = this.response ? 200 : 404
        this.onload()
      }
    }
    globalThis.XMLHttpRequest = Request`,
    context
  )
  vm.runInContext(readFileSync(join(directory, 'kuromoji.js'), 'utf8'), context)
  vm.runInContext(
    `var tokenizer
    kuromoji.builder({ dicPath: 'files://' }).build((error, built) => {
      if (error) throw error
      tokenizer = built
    })`,
    context
  )
  const tokenize = vm.runInContext('text => JSON.stringify(tokenizer.tokenize(text))', context) as (
    text: string
  ) => string
  return text => JSON.parse(tokenize(text)) as KuromojiToken[]
}

function found(tokenize: Tokenize, text: string): string {
  try {
    return JSON.stringify(tokenize(text).map(token => fields.map(field => token[field] ?? null)))
  } catch {
    return 'refused'
  }
}

function randomly(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x80000000
  }
}

function texts(pieces: readonly string[], count: number, seed: number): string[] {
  const random = randomly(seed)
  return Array.from({ length: count }, () => {
    let text = ''
    for (let piece = 1 + Math.floor(random() * 8); piece > 0; piece--) {
      text += pieces[Math.floor(random() * pieces.length)]
    }
    return text
  })
}

function differing(theirs: Tokenize, ours: Tokenize, sentences: readonly string[]): string[] {
  return sentences.filter(text => found(theirs, text) !== found(ours, text))
}

describe('the core tokenizes as kuromoji.js does', () => {
  test('with a small dictionary made to reach the odd cases', () => {
    const files = fixtureFiles(fixtureDictionary)
    const packed = new Map(
      Object.entries({ ...files, unk_compat: new Uint32Array(0x10000).buffer }).map(
        ([name, bytes]) => [`${name}.dat.gz`, gzipSync(new Uint8Array(bytes))]
      )
    )
    const theirs = kuromoji(name => packed.get(name))
    const ours = ipadicTokenizer(file => files[file])
    const pieces = [
      ...'東京都行猫犬にねのはをがあいabXY059!?。、「」 ',
      '東京',
      '京都',
      '行く',
      '都。',
      'ねこ',
      '😀',
      '𠀀',
      '\ud83d',
      '\ude00',
      '語',
      'é',
      '\u0000',
      '゙'
    ]
    const sentences = ['', ...pieces, ...texts(pieces, 30_000, 7)]
    expect(differing(theirs, ours, sentences)).toEqual([])
    expect(sentences.filter(text => found(ours, text) === 'refused').length).toBeGreaterThan(100)
  })

  test.runIf(artifactAvailable)('with the bundled dictionary', async () => {
    const theirs = await artifactTokenize()
    const ours = ipadicTokenizer((file: IpadicFile) => {
      const bytes = gunzipSync(readFileSync(join(directory, `${file}.dat.gz`)))
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer
    })
    const db = await artifactDatabase()
    const sentences = db
      .all<{ japanese: string }>(
        'SELECT japanese FROM example_sentences WHERE rowid % 97 = 0 ORDER BY rowid',
        []
      )
      .map(row => row.japanese)
    const pieces = [
      ...'のにはをがでともするしたないですます食べ見行日本語学校東京猫犬私彼アイーッヶｶﾞｱaBhelloWorld123４５一二十百%$.,!? 　\t\n、。「」（）・…〜々〇',
      'コーヒー',
      '😀',
      '𠀀',
      '\ud83d',
      '\ude00',
      '́',
      'é',
      'Я',
      '한',
      '\u0000',
      '゙',
      '﻿',
      '​',
      '￿'
    ]
    expect(sentences.length).toBeGreaterThan(2_000)
    expect(differing(theirs, ours, [...sentences, ...texts(pieces, 6_000, 11)])).toEqual([])
  })
})
