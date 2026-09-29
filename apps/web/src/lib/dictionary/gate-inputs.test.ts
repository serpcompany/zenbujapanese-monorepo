import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { afterAll, describe, expect, test } from 'vitest'

// Each release database's build ID hashes its build_inputs but leaves out tests
// (scripts/release-d1/build-id.sh), and Web deploy runs only for changes to its `paths`. So a
// change to anything a gate's tests run or draw imports a new build and checks it only if
// build_inputs lists that file, and a re-recorded suite deploys only if the workflow's paths list
// it. This checks both for each database's check_local.

const web = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const repo = resolve(web, '../..')
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
  return [...seen].map(file => relative(repo, file))
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

// build-id.sh names each input file by its path under its root (input_roots), not by where the
// root is, so #469 can move the language data without importing new builds. These build the ID in
// a scratch repository, with the real scripts and a small database.sh.
describe('build-id.sh', () => {
  const scripts = 'apps/web/scripts/release-d1'
  const settings = (root: string, extra = '') => `resources=${root}
source_db=$resources/Reference.sqlite3
input_roots=("resources=$resources" web=apps/web)
build_inputs=("$source_db" "$resources/Kanji.json" apps/web/src/core.ts${extra})
`
  const pointer = (oid: string, size = 1024) =>
    `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${size}\n`

  const scratches: string[] = []
  afterAll(() => {
    for (const dir of scratches) rmSync(dir, { recursive: true, force: true })
  })

  const scratch = () => {
    const dir = mkdtempSync(join(tmpdir(), 'build-id-'))
    scratches.push(dir)
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        [
          ...['-c', 'user.name=test', '-c', 'user.email=test@example.com'],
          ...['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null'],
          ...args
        ],
        { cwd: dir, stdio: 'pipe' }
      )
    const write = (path: string, text: string) => {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), text)
    }
    const commit = () => {
      git('add', '-A')
      git('commit', '-q', '-m', 'change')
    }
    for (const script of ['build-id.sh', 'common.sh']) {
      write(`${scripts}/${script}`, readFileSync(join(web, 'scripts/release-d1', script), 'utf8'))
    }
    write(`${scripts}/search/database.sh`, settings('apps/ios/Resources'))
    write('apps/ios/Resources/Reference.sqlite3', pointer('a'.repeat(64)))
    write('apps/ios/Resources/Kanji.json', '{"kanji": []}\n')
    write('apps/web/src/core.ts', 'export const core = 1\n')
    git('init', '-q')
    commit()
    const buildId = () =>
      spawnSync('bash', [join(dir, scripts, 'build-id.sh'), 'search'], {
        cwd: dir,
        encoding: 'utf8'
      })
    const id = () => {
      const result = buildId()
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
      return result.stdout.trim()
    }
    return { git, write, commit, buildId, id }
  }

  test('keeps the ID when a root moves, and changes it when a file changes', () => {
    const repo = scratch()
    const before = repo.id()
    expect(before).toMatch(/^[0-9a-f]{12}$/)

    repo.git('mv', 'apps/ios/Resources', 'language-data')
    repo.write(`${scripts}/search/database.sh`, settings('language-data'))
    repo.commit()
    expect(repo.id()).toBe(before)

    repo.write('language-data/Kanji.json', '{"kanji": ["一"]}\n')
    repo.commit()
    const edited = repo.id()
    expect(edited).not.toBe(before)

    // A Git LFS file counts by the SHA-256 in its pointer, not the pointer's blob: another size
    // line keeps the ID, and another oid changes it.
    repo.write('language-data/Reference.sqlite3', pointer('a'.repeat(64), 2048))
    repo.commit()
    expect(repo.id()).toBe(edited)

    repo.write('language-data/Reference.sqlite3', pointer('b'.repeat(64)))
    repo.commit()
    expect(repo.id()).not.toBe(edited)
  })

  // So an input outside every root, or one that's gone, fails here rather than in the deploy.
  test.each(['search', 'dictionary'])('builds the %s ID from its real settings', database => {
    const result = spawnSync(
      'bash',
      [join(web, scripts.slice('apps/web/'.length), 'build-id.sh'), database],
      {
        cwd: repo,
        encoding: 'utf8'
      }
    )
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/^[0-9a-f]{12}\n$/)
  })

  test('fails on a declared input that does not exist', () => {
    const repo = scratch()
    repo.write(
      `${scripts}/search/database.sh`,
      settings('apps/ios/Resources', ' apps/web/src/gone.ts')
    )
    repo.commit()
    const result = repo.buildId()
    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('apps/web/src/gone.ts')
  })
})
