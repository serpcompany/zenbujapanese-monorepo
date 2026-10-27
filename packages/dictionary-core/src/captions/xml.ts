export interface XMLReading {
  opened(name: string, attributes: ReadonlyMap<string, string>): void
  closed(name: string): void
  text(value: string): void
}

const tokens =
  /(<!--[\s\S]*?-->)|<!\[CDATA\[([\s\S]*?)\]\]>|<\?([\s\S]*?)\?>|(<!DOCTYPE(?:[^<>[\]]|\[[\s\S]*?\])*>)|(<[^<>"']*(?:(?:"[^"]*"|'[^']*')[^<>"']*)*>)|[^<]+/y
const name = '[A-Za-z_:\\u00c0-\\uffff][\\w.:\\u00b7\\u00c0-\\uffff-]*'
const tag = new RegExp(`^<(/?)(${name})([^]*?)[ \\t\\r\\n]*(/?)>$`)
const attribute = new RegExp(
  `[ \\t\\r\\n]+(${name})[ \\t\\r\\n]*=[ \\t\\r\\n]*(?:"([^"<]*)"|'([^'<]*)')`,
  'y'
)
const references = /&(?:#x([0-9A-Fa-f]+)|#([0-9]+)|(amp|lt|gt|quot|apos));/g
const predefined: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const blank = /^[ \t\r\n]*$/
const declaration = /^xml(?:[ \t\r\n]|$)/i

function isCharacter(code: number): boolean {
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  )
}

function resolved(raw: string): string | undefined {
  if (!raw.includes('&')) return raw
  if (raw.replace(references, '').includes('&')) return undefined
  let valid = true
  const value = raw.replace(references, (_, hex?: string, decimal?: string, entity?: string) => {
    if (entity) return predefined[entity] ?? ''
    const code = hex === undefined ? Number(decimal) : Number.parseInt(hex, 16)
    valid &&= isCharacter(code)
    return valid ? String.fromCodePoint(code) : ''
  })
  return valid ? value : undefined
}

function attributes(raw: string): Map<string, string> | undefined {
  const read = new Map<string, string>()
  attribute.lastIndex = 0
  while (attribute.lastIndex < raw.length) {
    const found = attribute.exec(raw)
    const key = found?.[1]
    const value = found && resolved((found[2] ?? found[3] ?? '').replace(/[\t\r\n]/g, ' '))
    if (!key || typeof value !== 'string' || read.has(key)) return undefined
    read.set(key, value)
  }
  return read
}

function element(token: string, reading: XMLReading, open: string[]): boolean {
  const [, closing, tagName, raw = '', selfClosing] = tag.exec(token) ?? []
  if (!tagName) return false
  if (closing) {
    if (raw !== '' || selfClosing || open.pop() !== tagName) return false
    reading.closed(tagName)
    return true
  }
  const read = attributes(raw)
  if (!read) return false
  reading.opened(tagName, read)
  if (selfClosing) reading.closed(tagName)
  else open.push(tagName)
  return true
}

function text(token: string, cdata: string | undefined, reading: XMLReading, inside: boolean) {
  if (!inside) return cdata === undefined && blank.test(token)
  const value = cdata ?? resolved(token)
  if (value === undefined || (cdata === undefined && token.includes(']]>'))) return false
  reading.text(value)
  return true
}

export function readXML(document: string, reading: XMLReading): boolean {
  const source = document.startsWith('﻿') ? document.slice(1) : document
  const open: string[] = []
  let roots = 0
  tokens.lastIndex = 0
  while (tokens.lastIndex < source.length) {
    const at = tokens.lastIndex
    const found = tokens.exec(source)
    if (!found) return false
    const [token, comment, cdata, instruction, doctype, markup] = found
    if (comment) continue
    if (instruction !== undefined && declaration.test(instruction) && at !== 0) return false
    if (doctype && roots > 0) return false
    if (instruction !== undefined || doctype) continue
    if (!markup) {
      if (!text(token, cdata, reading, open.length > 0)) return false
      continue
    }
    if (open.length === 0 && !token.startsWith('</') && roots++ > 0) return false
    if (!element(token, reading, open)) return false
  }
  return roots === 1 && open.length === 0
}
