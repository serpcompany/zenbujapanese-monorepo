import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, test } from 'vitest'

// Each release database's build ID hashes its build_inputs but leaves out tests
// (scripts/release-d1/build-id.sh), and Web deploy runs only for changes to its `paths`. So a
// change to anything a gate's tests run or draw imports a new build and checks it only if
// build_inputs lists that file, and a re-recorded suite deploys only if the workflow's paths list
// it. This checks both for each database's check_local.

const web = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const repo = resolve(web, '../..')
/** The shared core (packages/dictionary-core), imported as @zenbu/dictionary-core/<path>. */
const core = join(repo, 'packages/dictionary-core/src')
const corePackage = '@zenbu/dictionary-core/'
const resources = 'apps/ios/Modules/Sources/SearchExperience/Resources'

/** The words of a bash array's body, without comments, quotes, or the lfs_inputs expansion. */
function arrayItems(script: string, name: string): string[] {
  const body = script.match(new RegExp(`^${name}=\\(([\\s\\S]*?)\\)$`, 'm'))?.[1]
  if (body === undefined) throw new Error(`No ${name} array`)
  return body
    .split('\n')
    .map(line => line.replace(/#.*$/, '').trim())
    .flatMap(line => line.split(/\s+/))
    .filter(word => word !== '' && !word.includes('lfs_inputs'))
    .map(word => word.replace(/^"|"$/g, '').replace('$resources', resources))
    .map(word => (word === '$source_db' ? `${resources}/LanguageReferenceData.sqlite3` : word))
}

/** Local source files a file imports at run time (not `import type`), transitively. */
function runtimeImports(entry: string): string[] {
  const seen = new Set<string>()
  const resolveSpecifier = (from: string, specifier: string) => {
    const base = specifier.startsWith('@/')
      ? join(web, 'src', specifier.slice(2))
      : specifier.startsWith(corePackage)
        ? join(core, specifier.slice(corePackage.length))
        : specifier.startsWith('.')
          ? resolve(dirname(from), specifier)
          : null
    if (!base) return null
    return (
      ['', '.ts', '.tsx', '/index.ts']
        .map(ending => base + ending)
        .find(candidate => existsSync(candidate) && statSync(candidate).isFile()) ?? null
    )
  }
  const walk = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    if (!/\.tsx?$/.test(file)) return
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest)
    source.forEachChild(node => {
      if (
        (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) ||
        (ts.isExportDeclaration(node) && !node.isTypeOnly)
      ) {
        const specifier = node.moduleSpecifier
        if (specifier && ts.isStringLiteral(specifier)) {
          const found = resolveSpecifier(file, specifier.text)
          if (found) walk(found)
        }
      }
    })
  }
  walk(entry)
  // As the build inputs list them: from the repository root, with forward slashes.
  return [...seen].map(file => relative(repo, file).split(sep).join('/'))
}

const covers = (inputs: string[], path: string) =>
  inputs.some(input => path === input || path.startsWith(`${input}/`))

const deployPaths = [
  ...readFileSync(join(repo, '.github/workflows/web-deploy.yml'), 'utf8').matchAll(
    /^ {6}- (\S+)$/gm
  )
].map(([, path]) => path)

const deploys = (path: string) =>
  deployPaths.some(pattern =>
    pattern.endsWith('/**') ? `${path}/`.startsWith(pattern.slice(0, -2)) : path === pattern
  )

describe.each(['search', 'dictionary'])('the %s gate', database => {
  const script = readFileSync(join(web, `scripts/release-d1/${database}/database.sh`), 'utf8')
  const inputs = [...arrayItems(script, 'build_inputs'), ...arrayItems(script, 'lfs_inputs')]
  const checkLocal = script.match(/^check_local\(\) \{([\s\S]*?)^\}/m)?.[1] ?? ''
  const tests = [...checkLocal.matchAll(/src\/\S+\.test\.tsx?/g)].map(([path]) => path)

  test('runs its tests', () => {
    expect(tests.length).toBeGreaterThan(0)
  })

  test('lists every file its tests run or draw as a build input, but no test', () => {
    const imported = tests.flatMap(path => runtimeImports(join(web, path)))
    const missing = [...new Set(imported)].filter(
      path => !/\.test\.tsx?$/.test(path) && !covers(inputs, path)
    )
    expect(missing).toEqual([])
    expect(inputs.filter(input => /\.test\.tsx?$/.test(input))).toEqual([])
  })

  test('lists every suite its tests read as a build input', () => {
    const suites = tests.flatMap(path =>
      [
        ...readFileSync(join(web, path), 'utf8').matchAll(
          /LanguageData\/Conformance\/([\w-]+\.json)/g
        )
      ].map(([, name]) => `apps/ios/LanguageData/Conformance/${name}`)
    )
    expect(suites.length).toBeGreaterThan(0)
    expect(suites.filter(suite => !covers(inputs, suite))).toEqual([])
  })

  test('deploys when any build input outside apps/web changes', () => {
    const outside = inputs.filter(input => !input.startsWith('apps/web/'))
    expect(outside.filter(input => !deploys(input))).toEqual([])
  })
})
