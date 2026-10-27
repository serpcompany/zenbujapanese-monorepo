import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, test } from 'vitest'

const source = fileURLToPath(new URL('../../', import.meta.url))
const routes = join(source, 'app')
const packageSource = join(
  dirname(createRequire(import.meta.url).resolve('@zenbu/ui/styles/theme.css')),
  '..'
)
const stockComponents = [join(source, 'components', 'ui'), join(packageSource, 'components')]

const visibleAttributes = new Set(['alt', 'aria-label', 'title', 'placeholder', 'label'])
const metadataFields = new Set(['title', 'description', 'absolute', 'default', 'template'])

const namesAndIdentifiers = [
  'Zenbu Japanese',
  'Zenbu',
  'Tomodachi',
  'iPhone',
  'iPad',
  'Mac',
  'App Store',
  'YouTube',
  'Google',
  'Apple',
  'JLPT',
  'JMdict',
  'KANJIDIC2',
  'KanjiVG',
  'Tatoeba',
  'TUBELEX',
  'Jiten',
  'Wikipedia',
  'EDRDG',
  'DMCA',
  'N5',
  'N4',
  'N3',
  'N2',
  'N1'
]

const allowed = new RegExp(
  `\\b(?:${namesAndIdentifiers.map(name => name.replace(/ /g, '\\s')).join('|')})\\b`,
  'g'
)

function isEnglishText(text: string): boolean {
  return /[A-Za-z]{2,}/.test(text.replace(allowed, ''))
}

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) return stockComponents.includes(path) ? [] : sourceFiles(path)
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : []
  })
}

function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map(span => span.literal.text)].join(' ')
  }
  return null
}

function attributeText(node: ts.JsxAttribute): string | null {
  const value = node.initializer
  if (!value) return null
  if (ts.isJsxExpression(value)) return value.expression ? literalText(value.expression) : null
  return literalText(value)
}

function englishIn(path: string, content = readFileSync(path, 'utf8')): string[] {
  const file = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true)
  const isRoute = path.startsWith(routes)
  const found: string[] = []
  const report = (node: ts.Node, text: string | null) => {
    if (text === null || !isEnglishText(text)) return
    const { line } = file.getLineAndCharacterOfPosition(node.getStart())
    found.push(`${relative(source, path)}:${line + 1} ${JSON.stringify(text.trim())}`)
  }
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) report(node, node.text)
    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      report(node, literalText(node.expression))
    }
    if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.getText())) {
      report(node, attributeText(node))
    }
    if (isRoute && ts.isPropertyAssignment(node) && metadataFields.has(node.name.getText())) {
      report(node, literalText(node.initializer))
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

test('no page, component, or word component writes English text outside the dictionaries', () => {
  const files = [join(source, 'app'), join(source, 'components'), packageSource].flatMap(
    sourceFiles
  )
  expect(files.length).toBeGreaterThan(50)
  expect(
    files.flatMap(path => englishIn(path)).join('\n'),
    'Visible text, alt, aria-label, title, placeholder, label, and metadata come from src/lib/i18n/dictionaries (SERP localization standard, Strings): move each string into en.json and ja.json through its namespace'
  ).toBe('')
})

const dollar = '$'
const templateWithAValue = `{\`${dollar}{1} words\`}`

test('the check finds English in JSX text, attributes, and metadata, and allows names', () => {
  const sample = [
    "export const metadata = { title: 'About us', description: 'Zenbu Japanese' }",
    'export const A = () => (',
    '  <p title="Read more" aria-label="JLPT N5" className="text-sm">',
    `    Hello there <b>{'Zenbu Japanese'}</b> ${templateWithAValue} 日本語 © 2026`,
    '  </p>',
    ')'
  ].join('\n')
  expect(
    englishIn(join(routes, 'sample', 'page.tsx'), sample).map(line => line.replace(/^\S+ /, ''))
  ).toEqual(['"About us"', '"Read more"', '"Hello there"', '"words"'])
})
