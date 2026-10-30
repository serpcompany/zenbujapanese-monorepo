import { writeFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { type Extension, expect, test } from './fixtures.ts'
import { openStandInTranscript, sense, word } from './transcript-stand-in.ts'
import { setWordMeanings } from './word-underlines.ts'
import { tones } from './words-page.ts'

const vocabulary = {
  今日: word('今日', 'キョウ', 'kyou'),
  は: word('は', 'ハ', 'wa'),
  天気: word('天気', 'テンキ', 'tenki'),
  が: word('が', 'ガ', 'ga'),
  良い: word('良い', 'ヨイ', 'yoi'),
  ので: word('ので', 'ノデ', 'node'),
  公園: word('公園', 'コウエン', 'kouen'),
  で: word('で', 'デ', 'de'),
  友達: word('友達', 'トモダチ', 'tomodachi'),
  と: word('と', 'ト', 'to'),
  散歩: word('散歩', 'サンポ', 'sanpo'),
  しました: word('しました', 'シマシタ', 'suru'),
  図書館: word('図書館', 'トショカン', 'toshokan'),
  新しい: word('新しい', 'アタラシイ', 'atarashii'),
  本: word('本', 'ホン', 'hon'),
  を: word('を', 'ヲ', 'wo'),
  借りて: word('借りて', 'カリテ', 'kariru'),
  駅前: word('駅前', 'エキマエ', 'ekimae'),
  の: word('の', 'ノ', 'no'),
  喫茶店: word('喫茶店', 'キッサテン', 'kissaten'),
  美味しい: word('美味しい', 'オイシイ', 'oishii'),
  珈琲: word('珈琲', 'コーヒー', 'koohii'),
  飲み: word('飲み', 'ノミ', 'nomu'),
  ながら: word('ながら', 'ナガラ', 'nagara'),
  日本語: word('日本語', 'ニホンゴ', 'nihongo'),
  勉強: word('勉強', 'ベンキョウ', 'benkyou'),
  読んで: word('読んで', 'ヨンデ', 'yomu'),
  夕方: word('夕方', 'ユウガタ', 'yuugata'),
  まで: word('まで', 'マデ', 'made'),
  してから: word('してから', 'シテカラ', 'suru'),
  家: word('家', 'イエ', 'ie'),
  に: word('に', 'ニ', 'ni'),
  帰りました: word('帰りました', 'カエリマシタ', 'kaeru')
}

type Vocabulary = keyof typeof vocabulary

const meanings = {
  kyou: sense('today, this day', 'noun'),
  wa: sense('indicates sentence topic', 'particle'),
  tenki: sense('weather, the elements', 'noun'),
  ga: sense('indicates sentence subject', 'particle'),
  yoi: sense('good, excellent, fine, nice', 'adjective'),
  node: sense('that being the case, because of', 'particle'),
  kouen: sense('park, public garden', 'noun'),
  de: sense('at, in, by means of', 'particle'),
  tomodachi: sense('friend, companion', 'noun'),
  to: sense('with, and', 'particle'),
  sanpo: sense('walk, stroll', 'noun'),
  suru: sense('to do, to carry out, to perform', 'verb'),
  toshokan: sense('library', 'noun'),
  atarashii: sense('new, novel, fresh, recent', 'adjective'),
  hon: sense('book, volume, script', 'noun'),
  wo: sense('indicates direct object of action', 'particle'),
  kariru: sense('to borrow, to have on loan', 'verb'),
  ekimae: sense('in front of the station', 'noun'),
  no: sense('indicates possessive', 'particle'),
  kissaten: sense('coffee lounge, coffee shop, cafe', 'noun'),
  oishii: sense('good, tasty, nice, delicious', 'adjective'),
  koohii: sense('coffee', 'noun'),
  nomu: sense('to drink, to gulp, to swallow', 'verb'),
  nagara: sense('while, during, as', 'particle'),
  nihongo: sense('Japanese (language)', 'noun'),
  benkyou: sense('study, diligence, working hard', 'noun'),
  yomu: sense('to read', 'verb'),
  yuugata: sense('evening, dusk', 'noun'),
  made: sense('until, till, as far as', 'particle'),
  ie: sense('house, residence, dwelling', 'noun'),
  ni: sense('at, in, on, to', 'particle'),
  kaeru: sense('to return, to come home, to go home', 'verb')
}

const line = (start: number, words: Vocabulary[]) => ({
  start,
  text: words.join(''),
  tokens: words.map(text => vocabulary[text])
})

const lines = [
  line(0, ['今日', 'は', '天気', 'が', '良い']),
  line(4, [
    '今日',
    'は',
    '天気',
    'が',
    '良い',
    'ので',
    '公園',
    'で',
    '友達',
    'と',
    '散歩',
    'しました'
  ]),
  line(8, [
    '図書館',
    'で',
    '新しい',
    '本',
    'を',
    '借りて',
    '駅前',
    'の',
    '喫茶店',
    'で',
    '美味しい',
    '珈琲',
    'を',
    '飲み',
    'ながら',
    '日本語',
    'を',
    '勉強',
    'しました'
  ]),
  line(12, [
    '駅前',
    'の',
    '喫茶店',
    'で',
    '友達',
    'と',
    '美味しい',
    '珈琲',
    'を',
    '飲み',
    'ながら',
    '新しい',
    '本',
    'を',
    '読んで',
    '夕方',
    'まで',
    '日本語',
    'を',
    '勉強',
    'してから',
    '家',
    'に',
    '帰りました'
  ])
]

const widths = [320, 500]

async function openTranscript(page: Page, extension: Extension, width: number) {
  await page.setViewportSize({ width, height: 900 })
  return openStandInTranscript(page, extension, {
    videoId: 'zenbuJa1172',
    time: 1,
    lines,
    meanings,
    wordMeanings: false
  })
}

function wrapping(page: Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector('[aria-label="Transcript"]')?.parentElement
    const cards = [...document.querySelectorAll<HTMLElement>('[data-line]')].map(card => {
      const inside = card.getBoundingClientRect()
      const source = card.querySelector('[data-source]')
      const limit = source?.getBoundingClientRect().right ?? inside.right
      const items = [...(source?.children ?? [])]
      const rows: Element[][] = []
      let left = Number.POSITIVE_INFINITY
      for (const item of items) {
        const box = item.getBoundingClientRect()
        if (box.left <= left) rows.push([])
        rows.at(-1)?.push(item)
        left = box.left
      }
      const boxes = (row: Element[], selector: string) =>
        row
          .flatMap(item => [item, ...item.querySelectorAll(selector)])
          .map(each => each.getBoundingClientRect())
      const early = rows.slice(1).filter((row, index) => {
        const before = rows[index].at(-1)?.getBoundingClientRect().right ?? 0
        return before + row[0].getBoundingClientRect().width <= limit + 0.5
      }).length
      const overlaps = rows.slice(1).flatMap((row, index) => {
        const above = Math.max(...boxes(rows[index], '*').map(box => box.bottom))
        const top = Math.min(...boxes(row, 'rt').map(box => box.top))
        return top + 0.5 < above ? [Math.round((above - top) * 10) / 10] : []
      })
      const outside = [...card.querySelectorAll('[data-word], rt, [data-aid="meaning"]')].filter(
        each => {
          const box = each.getBoundingClientRect()
          return box.left < inside.left - 0.5 || box.right > inside.right + 0.5
        }
      ).length
      const spread = [...card.querySelectorAll('ruby')].filter(
        ruby => getComputedStyle(ruby).getPropertyValue('ruby-align') !== 'center'
      ).length
      return { rows: rows.length, early, overlaps, outside, spread }
    })
    return {
      cards,
      pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth,
      transcriptScrollsSideways: scroller ? scroller.scrollWidth > scroller.clientWidth : true
    }
  })
}

for (const width of widths)
  test(`wraps short and long captions inside their cards at ${width} pixels, breaking a row only where the next word doesn't fit, with no sideways scroll, no furigana over the line above, and no word spread apart under its furigana, with Word Meanings off and on, in light and dark`, async ({
    extension,
    page
  }) => {
    const transcript = await openTranscript(page, extension, width)
    const measured: Record<string, unknown> = {}
    for (const on of [false, true]) {
      await setWordMeanings(extension, transcript, on)
      const aids = on ? 'meanings' : 'plain'
      const layout = await wrapping(page)
      measured[aids] = layout
      expect(layout).toMatchObject({ pageScrollsSideways: false, transcriptScrollsSideways: false })
      expect(
        layout.cards.map(card => [card.early, card.overlaps, card.outside, card.spread])
      ).toEqual(lines.map(() => [0, [], 0, 0]))
      for (const tone of tones) {
        await page.emulateMedia({ colorScheme: tone })
        await expect(page.locator('html')).toHaveClass(tone === 'dark' ? /dark/ : /^(?!.*dark)/)
        await transcript.screenshot({
          path: test.info().outputPath(`long-lines-${aids}-${tone}.png`)
        })
      }
    }
    const rows = (measured.plain as Awaited<ReturnType<typeof wrapping>>).cards.map(
      card => card.rows
    )
    expect(rows[0]).toBe(1)
    expect(rows.at(-1)).toBeGreaterThan(1)
    expect(rows).toEqual(rows.toSorted((a, b) => a - b))
    writeFileSync(test.info().outputPath('layout.json'), JSON.stringify(measured))
  })
