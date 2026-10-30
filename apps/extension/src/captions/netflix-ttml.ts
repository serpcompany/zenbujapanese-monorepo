import type { TimedLine } from '@zenbu/dictionary-core/captions/lines'
import { readXML } from '@zenbu/dictionary-core/captions/xml'

type Attributes = ReadonlyMap<string, string>

type Style = { ruby: string | undefined; style: string | undefined }

type Reading = { start: number; end: number; parts: string[] }

const readings = new Set(['text', 'textContainer', 'delimiter'])

const clockTime = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/

const offsetTime = /^(\d+(?:\.\d+)?)(h|m|s|ms|t)$/

const inSeconds: Record<string, (count: number, tickRate: number) => number> = {
  h: count => count * 3600,
  m: count => count * 60,
  s: count => count,
  ms: count => count / 1000,
  t: (count, tickRate) => count / tickRate
}

const localName = (name: string) => name.slice(name.indexOf(':') + 1)

function attribute(attributes: Attributes, name: string): string | undefined {
  for (const [key, value] of attributes) if (localName(key) === name) return value
  return undefined
}

function seconds(value: string | undefined, tickRate: number): number | null {
  const time = value?.trim() ?? ''
  const clock = clockTime.exec(time)
  if (clock) return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
  const [, count, unit] = offsetTime.exec(time) ?? []
  const convert = unit === undefined ? undefined : inSeconds[unit]
  return convert && count !== undefined ? convert(Number(count), tickRate) : null
}

function styledRuby(
  ids: string | undefined,
  styles: ReadonlyMap<string, Style>,
  seen: Set<string>
): string | undefined {
  for (const id of (ids?.split(/\s+/) ?? []).reverse()) {
    const style = styles.get(id)
    if (!style || seen.has(id)) continue
    seen.add(id)
    const ruby = style.ruby ?? styledRuby(style.style, styles, seen)
    if (ruby) return ruby
  }
  return undefined
}

const rubyOf = (attributes: Attributes, styles: ReadonlyMap<string, Style>) =>
  attribute(attributes, 'ruby') ?? styledRuby(attribute(attributes, 'style'), styles, new Set())

const spokenText = (parts: readonly string[]) =>
  parts.map(part => part.replace(/[ \t\r\n]+/g, ' ')).join('\n')

export function ttmlLines(ttml: string): TimedLine[] | null {
  const lines: TimedLine[] = []
  const styles = new Map<string, Style>()
  const hidden: boolean[] = []
  let tickRate = 1
  let root: string | undefined
  let reading: Reading | null = null
  let opened = 0
  const readable = readXML(ttml, {
    opened(name, attributes) {
      const element = localName(name)
      root ??= element
      if (element === 'tt') tickRate = Number(attribute(attributes, 'tickRate')) || 1
      const id = attribute(attributes, 'id')
      if (element === 'style' && id !== undefined)
        styles.set(id, {
          ruby: attribute(attributes, 'ruby'),
          style: attribute(attributes, 'style')
        })
      if (element === 'p') {
        const start = seconds(attribute(attributes, 'begin'), tickRate)
        const end = seconds(attribute(attributes, 'end'), tickRate)
        const length = seconds(attribute(attributes, 'dur'), tickRate)
        reading = start === null ? null : { start, end: end ?? start + (length ?? 0), parts: [''] }
        opened = hidden.length
      }
      hidden.push(readings.has(rubyOf(attributes, styles) ?? ''))
      if (element === 'br') reading?.parts.push('')
    },
    text(value) {
      if (!reading || hidden.slice(opened).includes(true)) return
      reading.parts[reading.parts.length - 1] += value
    },
    closed(name) {
      hidden.pop()
      if (localName(name) !== 'p' || !reading) return
      lines.push({ start: reading.start, end: reading.end, text: spokenText(reading.parts) })
      reading = null
    }
  })
  return readable && root === 'tt' ? lines : null
}
