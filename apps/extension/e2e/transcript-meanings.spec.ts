import { writeFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { labels } from '../src/side-panel/labels.ts'
import { videoTabLabels } from '../src/video-tab/labels.ts'
import { type Extension, expect, extensionUrl, test } from './fixtures.ts'
import { changeSettings, tones } from './words-page.ts'

const videoId = 'zenbuJa0624'

const word = (text: string, reading: string, id: string) => ({
  text,
  reading,
  languageReferenceID: id
})

const lines = [
  {
    start: 380,
    text: '拭き拭き拭き拭きます',
    tokens: [
      word('拭き', 'フキ', 'fuku'),
      word('拭き', 'フキ', 'fuku'),
      word('拭き', 'フキ', 'fuku'),
      word('拭きます', 'フキマス', 'fuku')
    ]
  },
  {
    start: 384,
    text: '床のゴミを取って',
    tokens: [
      word('床', 'ユカ', 'yuka'),
      word('の', 'ノ', 'no'),
      word('ゴミ', 'ゴミ', 'gomi'),
      word('を', 'ヲ', 'wo'),
      word('取って', 'トッテ', 'toru')
    ]
  }
]

const meanings: Record<string, string> = {
  fuku: 'to wipe, to mop, to dry',
  yuka: 'floor',
  no: 'indicates possessive',
  gomi: 'rubbish, trash, garbage',
  wo: 'indicates direct object of action',
  toru: 'to take, to pick up'
}

const narrowestPanel = 360

const panelWidths = [380, narrowestPanel]

function standInVideo(page: Page) {
  return page.addInitScript(
    ({ videoId, lines, meanings }) => {
      const tab = { id: 624, url: `https://www.youtube.com/watch?v=${videoId}`, title: 'YouTube' }
      const query = chrome.tabs.query.bind(chrome.tabs)
      const playback = { videoId, time: 385, playing: false, rate: 1, ad: false, ended: false }
      const event = (added?: (listener: (message: unknown) => void) => void) => ({
        addListener: (listener: (message: unknown) => void) => added?.(listener),
        removeListener: () => undefined
      })
      const port = () => ({
        name: 'video-tab',
        disconnect: () => undefined,
        onDisconnect: event(),
        onMessage: event(listener =>
          setTimeout(() => listener({ target: 'video-tab', playback }), 0)
        )
      })
      const captions = lines.map((line, id) => ({
        id,
        start: line.start,
        end: line.start + 4,
        text: line.text,
        translation: null
      }))
      const send = chrome.runtime.sendMessage.bind(chrome.runtime)
      const answer = (message: {
        captions?: unknown
        request?: { type?: string; text?: string; languageReferenceID?: string }
      }) => {
        if (message?.captions) return { state: 'lines', videoId, lines: captions }
        const request = message?.request
        if (request?.type === 'segment') {
          const tokens = lines.find(line => line.text === request.text)?.tokens ?? []
          return { type: 'segment', tokens, romaji: null }
        }
        if (request?.type === 'popup') {
          const meaning = meanings[request.languageReferenceID ?? '']
          return { type: 'popup', card: { card: { meanings: [{ meaning }] }, romaji: null } }
        }
        return null
      }
      Object.assign(chrome.tabs, {
        query: (info: chrome.tabs.QueryInfo) =>
          info.active ? Promise.resolve([tab]) : query(info),
        connect: port
      })
      Object.assign(chrome.runtime, {
        sendMessage: (...sent: Parameters<typeof send>) => {
          const answered = answer(sent[0] as Parameters<typeof answer>[0])
          return answered ? Promise.resolve(answered) : send(...sent)
        }
      })
    },
    { videoId, lines, meanings }
  )
}

async function openTranscript(page: Page, extension: Extension, width: number) {
  await changeSettings(extension, {
    'readingAids.furigana': true,
    'readingAids.romaji': false,
    'readingAids.wordMeanings': true,
    'readingAids.translations': false
  })
  await page.setViewportSize({ width, height: 720 })
  await standInVideo(page)
  await page.goto(extensionUrl(extension, 'pages/side-panel.html'))
  await page.getByRole('tab', { name: labels.tabs.video }).click()
  const transcript = page.getByRole('list', { name: videoTabLabels.transcript })
  await expect(transcript.locator('[data-aid="meaning"]')).toHaveCount(9)
  await expect(transcript.locator('[data-line="1"][data-current]')).toBeVisible()
  return transcript
}

function meaningLayout(page: Page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-line]')].map(row => {
      const shown = [...row.querySelectorAll<HTMLElement>('[data-aid="meaning"]')]
      const boxes = shown.map(meaning => meaning.getBoundingClientRect())
      const touching = boxes.flatMap((box, index) =>
        boxes.slice(index + 1).flatMap((other, offset) => {
          const apart = Math.max(
            other.left - box.right,
            box.left - other.right,
            other.top - box.bottom,
            box.top - other.bottom
          )
          return apart > 0 ? [] : [`${shown[index].title} / ${shown[index + offset + 1].title}`]
        })
      )
      const outsideColumn = shown.flatMap((meaning, index) => {
        const column = meaning.parentElement?.getBoundingClientRect()
        const box = boxes[index]
        const inside = column && box.left >= column.left - 0.5 && box.right <= column.right + 0.5
        return inside ? [] : [meaning.title]
      })
      const source = row.querySelector('[data-source]')?.getBoundingClientRect()
      const first = shown[0].parentElement?.getBoundingClientRect()
      const firstIndent = source && first ? Math.round(first.left - source.left) : null
      return { touching, outsideColumn, firstIndent }
    })
    const pageScrollsSideways = document.documentElement.scrollWidth > window.innerWidth
    return { rows, pageScrollsSideways }
  })
}

function meaningContrast(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const paint = canvas.getContext('2d', { willReadFrequently: true })
    if (!paint) throw new Error('No canvas')
    const rgba = (colour: string) => {
      paint.clearRect(0, 0, 1, 1)
      paint.fillStyle = colour
      paint.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data
      return { rgb: [r, g, b], alpha: a / 255 }
    }
    const behind = (element: Element) => {
      const layers: Element[] = []
      for (let at: Element | null = element; at; at = at.parentElement) layers.unshift(at)
      return layers.reduce(
        (under, layer) => {
          const { rgb, alpha } = rgba(getComputedStyle(layer).backgroundColor)
          return under.map((channel, index) => rgb[index] * alpha + channel * (1 - alpha))
        },
        [255, 255, 255]
      )
    }
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map(channel => {
        const value = channel / 255
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const ratio = (one: number[], two: number[]) => {
      const [light, dark] = [luminance(one), luminance(two)].sort((a, b) => b - a)
      return (light + 0.05) / (dark + 0.05)
    }
    return [...document.querySelectorAll('[data-line]')].map(row => {
      const meaning = row.querySelector('[data-aid="meaning"]')
      if (!meaning) throw new Error('No meaning')
      const background = behind(meaning)
      const { rgb, alpha } = rgba(getComputedStyle(meaning).color)
      const text = rgb.map((channel, index) => channel * alpha + background[index] * (1 - alpha))
      const current = row.hasAttribute('data-current')
      return { current, ratio: Math.round(ratio(text, background) * 100) / 100 }
    })
  })
}

for (const width of panelWidths) {
  test(`spaces long neighbouring word meanings apart in the transcript at ${width} pixels, readable in light and dark`, async ({
    extension,
    page
  }) => {
    const transcript = await openTranscript(page, extension, width)
    const measured: Record<string, unknown> = {}
    for (const tone of tones) {
      await page.emulateMedia({ colorScheme: tone })
      await expect(page.locator('html')).toHaveClass(tone === 'dark' ? /dark/ : /^(?!.*dark)/)
      await page.waitForFunction(() => document.getAnimations().length === 0)
      expect(await meaningLayout(page)).toEqual({
        rows: [
          { touching: [], outsideColumn: [], firstIndent: 0 },
          { touching: [], outsideColumn: [], firstIndent: 0 }
        ],
        pageScrollsSideways: false
      })
      const contrast = await meaningContrast(page)
      measured[tone] = contrast
      for (const { ratio } of contrast) expect(ratio).toBeGreaterThanOrEqual(4.5)
      await transcript.screenshot({ path: test.info().outputPath(`transcript-${tone}.png`) })
    }
    writeFileSync(test.info().outputPath('contrast.json'), JSON.stringify(measured))
  })
}

test('gives a cut word meaning its full text as a tooltip and to a screen reader', async ({
  extension,
  page
}) => {
  const transcript = await openTranscript(page, extension, narrowestPanel)
  const object = transcript.locator('[data-line="1"] [data-aid="meaning"]').nth(3)
  await expect(object).toHaveAttribute('title', 'indicates direct object of action')
  expect(await object.evaluate(meaning => meaning.scrollWidth > meaning.clientWidth)).toBe(true)
  expect(await transcript.locator('[data-line="1"]').ariaSnapshot()).toContain(
    'indicates direct object of action'
  )
})
