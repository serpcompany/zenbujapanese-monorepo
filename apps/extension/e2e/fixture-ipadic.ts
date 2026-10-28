import { gzipSync } from 'node:zlib'
import { ipadicFiles } from '@zenbu/dictionary-core/examples/ipadic'
import {
  type FixtureDictionary,
  fixtureFiles
} from '@zenbu/dictionary-core/examples/ipadic.fixture'
import { kuromojiFile } from '../src/worker/release-files.ts'

const knownCost = 100

const word = (surface: string, features: string) => ({
  surface,
  left: 1,
  right: 1,
  cost: knownCost,
  features
})

const noun = (surface: string, reading: string, spoken: string) =>
  word(surface, `名詞,一般,*,*,*,*,${surface},${reading},${spoken}`)

const particle = (surface: string, kind: string, reading: string, spoken = reading) =>
  word(surface, `助詞,${kind},*,*,*,${surface},${reading},${spoken}`)

type Range = [from: number, to: number]

const characters = (ranges: readonly Range[]) =>
  ranges
    .flatMap(([from, to]) =>
      Array.from({ length: to - from + 1 }, (_, offset) => String.fromCharCode(from + offset))
    )
    .join('')

const unknown = (
  name: string,
  ranges: readonly Range[],
  [alwaysInvoked, grouped]: [boolean, boolean],
  cost: number,
  partOfSpeech: string
) => ({
  name,
  alwaysInvoked,
  grouped,
  characters: characters(ranges),
  words: [{ left: 1, right: 1, cost, features: `${name},${partOfSpeech},*,*,*,*,*` }]
})

const ipadic: FixtureDictionary = {
  words: [
    word('要求', '名詞,サ変接続,*,*,*,*,要求,ヨウキュウ,ヨーキュー'),
    word('要る', '動詞,自立,*,*,五段・ラ行,基本形,要る,イル,イル'),
    word('いる', '動詞,自立,*,*,一段,基本形,いる,イル,イル'),
    noun('要', 'よう', 'ヨー'),
    noun('要所', 'ヨウショ', 'ヨーショ'),
    noun('要領', 'ヨウリョウ', 'ヨーリョー'),
    noun('要項', 'ヨウコウ', 'ヨーコー'),
    particle('が', '格助詞,一般', 'ガ'),
    particle('を', '格助詞,一般', 'ヲ', 'オ'),
    particle('に', '格助詞,一般', 'ニ'),
    particle('は', '係助詞,*', 'ハ', 'ワ'),
    particle('と', '並立助詞,*', 'ト'),
    particle('の', '連体化,*', 'ノ'),
    word('です', '助動詞,*,*,*,特殊・デス,基本形,です,デス,デス'),
    word('。', '記号,句点,*,*,*,*,。,。,。'),
    word('、', '記号,読点,*,*,*,*,、,、,、')
  ],
  classes: [
    unknown('DEFAULT', [], [false, true], 3000, '記号,一般'),
    unknown(
      'SPACE',
      [
        [0x09, 0x0a],
        [0x0d, 0x0d],
        [0x20, 0x20],
        [0x3000, 0x3000]
      ],
      [false, true],
      100,
      '記号,空白'
    ),
    unknown(
      'KANJI',
      [
        [0x3005, 0x3006],
        [0x3400, 0x4dbf],
        [0x4e00, 0x9fff],
        [0xf900, 0xfaff]
      ],
      [false, false],
      2000,
      '名詞,一般'
    ),
    unknown('HIRAGANA', [[0x3041, 0x309f]], [false, true], 2500, '名詞,一般'),
    unknown(
      'KATAKANA',
      [
        [0x30a1, 0x30ff],
        [0xff66, 0xff9f]
      ],
      [true, true],
      1500,
      '名詞,一般'
    ),
    unknown(
      'ALPHA',
      [
        [0x41, 0x5a],
        [0x61, 0x7a],
        [0xff21, 0xff3a],
        [0xff41, 0xff5a]
      ],
      [true, true],
      1500,
      '名詞,一般'
    ),
    unknown(
      'NUMERIC',
      [
        [0x30, 0x39],
        [0xff10, 0xff19]
      ],
      [true, true],
      300,
      '名詞,数'
    ),
    unknown(
      'SYMBOL',
      [
        [0x21, 0x2f],
        [0x3a, 0x40],
        [0x5b, 0x60],
        [0x7b, 0x7e],
        [0x3001, 0x3004],
        [0x3008, 0x303f],
        [0xff01, 0xff0f],
        [0xff1a, 0xff20],
        [0xff3b, 0xff40],
        [0xff5b, 0xff65]
      ],
      [true, true],
      1000,
      '記号,一般'
    )
  ],
  connections: [
    [0, 0],
    [0, 0]
  ]
}

export function kuromojiFiles(): [string, Uint8Array][] {
  const files = fixtureFiles(ipadic)
  return ipadicFiles.map(file => [
    kuromojiFile(file),
    new Uint8Array(gzipSync(new Uint8Array(files[file])))
  ])
}
