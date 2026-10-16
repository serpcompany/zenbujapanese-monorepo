const namesAndIdentifiers = [
  'Wikipedia Word Frequency Clean',
  'EDRDG licence',
  'Creative Commons',
  'Zenbu',
  'JLPT',
  'YouTube',
  'Wikipedia',
  'TUBELEX',
  'JMdict',
  'KANJIDIC2',
  'KanjiVG',
  'Kanjium',
  'RADKFILE',
  'UniDic',
  'Tatoeba',
  'Jiten',
  'jiten.moe',
  'EDRDG',
  'Sudachi.rs',
  'SudachiDict',
  'Sudachi',
  'kuromoji.js',
  'Kuromoji',
  'MeCab IPADIC',
  'DaKanji',
  'Jonathan Waller',
  'stephenmk',
  'Adam Nohejl',
  'Ulrich Apel',
  'Uros O.',
  'Dario Radmann',
  'tanos.co.uk',
  'CC BY-SA 4.0',
  'CC BY-SA 3.0',
  'CC BY 2.0 FR',
  'CC BY',
  'BSD-3-Clause',
  'BSD',
  'Apache-2.0',
  'IPADIC',
  'MIT'
]

const english = /[A-Za-z]{2,}/

function withoutEach(text: string, parts: readonly string[]): string {
  return [...parts]
    .filter(part => part !== '')
    .sort((left, right) => right.length - left.length)
    .reduce((rest, part) => rest.split(part).join(' '), text)
}

export function englishLeftIn(text: string, data: readonly string[] = []): string | null {
  const rest = withoutEach(withoutEach(text, data), namesAndIdentifiers)
  return english.test(rest) ? rest.replace(/\s+/g, ' ').trim() : null
}

const voidElements = new Set(['area', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta'])

export function withoutEnglishSource(html: string): string {
  let kept = ''
  let skipping = 0
  let last = 0
  for (const tag of html.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b([^>]*)>/g)) {
    const index = tag.index ?? 0
    if (skipping === 0) kept += html.slice(last, index)
    last = index + tag[0].length
    const [, closing, name, attributes] = tag
    const opens = !closing && !voidElements.has(name) && !attributes.endsWith('/')
    if (skipping > 0) {
      if (opens) skipping += 1
      else if (closing) skipping -= 1
      continue
    }
    if (opens && /\slang="en"/.test(attributes)) skipping = 1
    else kept += tag[0]
  }
  return skipping === 0 ? kept + html.slice(last) : kept
}

export function withoutScripts(html: string): string {
  return html.replace(/<script\b[\s\S]*?<\/script>/g, '')
}
