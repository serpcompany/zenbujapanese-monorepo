import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterAll, expect, test } from 'vitest'
import { describeDuplicate, findDuplicates } from './duplicates'
import { root } from './files'

mkdirSync(join(root, 'tmp'), { recursive: true })
const folder = mkdtempSync(join(root, 'tmp', 'duplicates-'))
afterAll(() => rmSync(folder, { recursive: true, force: true }))

function file(name: string, content: string): string {
  writeFileSync(join(folder, name), content)
  return relative(root, join(folder, name))
}

const repeated = (
  name: string
) => `export function ${name}(rows: { id: number; title: string; reading: string }[]) {
  const seen = new Set<number>()
  const kept: { id: number; title: string; reading: string }[] = []
  for (const row of rows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    kept.push({ ...row, title: row.title.trim(), reading: row.reading.normalize('NFKC') })
  }
  return kept.sort((left, right) => left.title.localeCompare(right.title) || left.id - right.id)
}
`

test('finds a block repeated across files and names both places', () => {
  const first = file('first.ts', repeated('uniqueWords'))
  const second = file('second.ts', `export const site = 'zenbu'\n\n${repeated('uniqueKanji')}`)
  const found = findDuplicates([first, second])
  expect(found).toHaveLength(1)
  expect(describeDuplicate(found[0])).toMatch(
    new RegExp(`^${first}:\\d+-\\d+  repeats ${second}:\\d+-\\d+ \\(\\d+ lines\\)$`)
  )
})

test.each([
  ['tsx', 'ts'],
  ['js', 'ts']
])('compares a .%s file with a .%s file', (left, right) => {
  const first = file(`component.${left}`, repeated('uniqueTitles'))
  const second = file(`helper.${right}`, `export const app = 'zenbu'\n\n${repeated('uniqueIds')}`)
  expect(findDuplicates([first, second])).toHaveLength(1)
})

const repeatedIn: Record<string, string> = {
  sh: `check() {
  local environment="$1" image reference release running container current=""
  if [ ! -r "$config_dir/$environment.env" ]; then
    log "$environment: skipped; it isn't set up on this server"
    return 0
  fi
  image="$(docker image inspect --format '{{.Id}}' "$repository:$environment")" || return 1
  release="$(release_of "$image")"
  echo "$release $reference $running $container $current"
}
`,
  py: `def rows(database, query, limit):
    cursor = database.execute(query, (limit,))
    result = []
    for row in cursor.fetchall():
        if row[0] is None:
            continue
        result.append({"id": row[0], "title": row[1].strip(), "reading": row[2]})
    result.sort(key=lambda item: (item["title"], item["id"]))
    return result[:limit]
`,
  swift: `func rows(_ items: [Item], limit: Int) -> [Item] {
    var seen = Set<Int>()
    var kept: [Item] = []
    for item in items {
        if seen.contains(item.id) { continue }
        seen.insert(item.id)
        kept.append(Item(id: item.id, title: item.title.trimmed, reading: item.reading))
    }
    return Array(kept.sorted { $0.title < $1.title }.prefix(limit))
}
`
}

test.each(Object.keys(repeatedIn))('finds a block repeated across .%s files', extension => {
  const first = file(`first.${extension}`, repeatedIn[extension])
  const second = file(`second.${extension}`, repeatedIn[extension])
  expect(findDuplicates([first, second])).toHaveLength(1)
})

test('passes code that says each thing once', () => {
  const only = file('only.ts', repeated('uniqueRows'))
  const other = file('other.ts', 'export const greeting = (name: string) => `Hello, ${name}`\n')
  expect(findDuplicates([only, other])).toEqual([])
})

test('ignores files that are not code', () => {
  const notes = file('notes.md', `${repeated('a')}\n${repeated('b')}`)
  expect(findDuplicates([notes])).toEqual([])
})
