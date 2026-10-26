import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { withoutGitLocation } from './git-environment.mjs'

export const migrationsFolder = 'apps/account-api/migrations'

export const migrationRule =
  "A deploy migrates while the old image still serves, so a migration drops or renames only what main's code no longer reads (docs/agents/account-migrations.md). Main's code reads every table and column of main's last snapshot: Drizzle names each column the schema declares in what it selects and returns. Add first and remove in a later release: take the table or column out of the schema and the code, run pnpm db:generate, and delete the drop from the migration it writes, so the snapshot leaves it out while the database keeps it; once that is on main, drop it in a migration of its own (pnpm db:generate --custom)."

const word = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)`
const name = String.raw`${word}(?:\s*\.\s*${word})?`
const each = pattern => new RegExp(pattern, 'g')

const unquote = part =>
  part.startsWith('"') ? part.slice(1, -1).replaceAll('""', '"') : part.toLowerCase()

function tableOf(written) {
  const parts = written.match(each(word)).map(unquote)
  return parts.length === 2 ? `${parts[0]}.${parts[1]}` : `public.${parts[0]}`
}

const quoted = /'(?:[^']|'')*'|"(?:[^"]|"")*"/y
const comment = /--[^\n]*|\/\*[\s\S]*?\*\//y
const dollarQuote = /\$(?:[A-Za-z_]\w*)?\$/y

function statementsOf(sql) {
  const statements = []
  let current = ''
  let at = 0
  while (at < sql.length) {
    const token = [quoted, comment, dollarQuote].find(pattern => {
      pattern.lastIndex = at
      return pattern.test(sql)
    })
    if (token) {
      const end = token.lastIndex
      current += token === quoted ? sql.slice(at, end) : ' '
      at = end
    } else if (sql[at] === ';') {
      statements.push(current)
      current = ''
      at += 1
    } else {
      current += sql[at]
      at += 1
    }
  }
  return [...statements, current].map(text => text.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

function actionsOf(text) {
  const actions = []
  let depth = 0
  let start = 0
  for (const [at, character] of [...text].entries()) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (character === ',' && depth === 0) {
      actions.push(text.slice(start, at).trim())
      start = at + 1
    }
  }
  return [...actions, text.slice(start).trim()]
}

const schemaChange = /\b(?:DROP TABLE|DROP SCHEMA|ALTER TABLE)\b/i
const dropTable = new RegExp(`^DROP TABLE (?:IF EXISTS )?(${name}(?: ?, ?${name})*)`, 'i')
const dropSchema = new RegExp(`^DROP SCHEMA (?:IF EXISTS )?(${word}(?: ?, ?${word})*)`, 'i')
const alterTable = new RegExp(
  String.raw`^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?(${name}) ?\*? (.+)$`,
  'i'
)
const renameTable = new RegExp(`^RENAME TO (${name})`, 'i')
const moveTable = new RegExp(`^SET SCHEMA (${word})`, 'i')
const renameColumn = new RegExp(`^RENAME (?:COLUMN )?(${word}) TO (${word})`, 'i')
const dropColumn = new RegExp(`^DROP (?:COLUMN )?(?:IF EXISTS )?(${word})`, 'i')
const ofAConstraint = /^(?:RENAME|DROP) CONSTRAINT\b/i

function changeOf(action, table) {
  if (ofAConstraint.test(action)) return []
  const renamed = renameTable.exec(action)
  if (renamed) return [{ kind: 'renames', table, to: tableOf(renamed[1]) }]
  const moved = moveTable.exec(action)
  if (moved) return [{ kind: 'moves', table, to: unquote(moved[1]) }]
  const column = renameColumn.exec(action)
  if (column)
    return [{ kind: 'renames', table, column: unquote(column[1]), to: unquote(column[2]) }]
  const dropped = dropColumn.exec(action)
  if (dropped) return [{ kind: 'drops', table, column: unquote(dropped[1]) }]
  return []
}

function changesOf(statement) {
  const start = schemaChange.exec(statement)
  if (!start) return []
  const text = statement.slice(start.index)
  const tables = dropTable.exec(text)
  if (tables)
    return tables[1].match(each(name)).map(table => ({ kind: 'drops', table: tableOf(table) }))
  const schemas = dropSchema.exec(text)
  if (schemas)
    return schemas[1].match(each(word)).map(schema => ({ kind: 'drops', schema: unquote(schema) }))
  const altered = alterTable.exec(text)
  if (!altered) return []
  return actionsOf(altered[2]).flatMap(action => changeOf(action, tableOf(altered[1])))
}

export const changesIn = sql => statementsOf(sql).flatMap(changesOf)

export function tablesIn(snapshot) {
  return new Map(
    Object.values(snapshot.tables ?? {}).map(table => [
      `${table.schema || 'public'}.${table.name}`,
      new Set(Object.values(table.columns).map(column => column.name))
    ])
  )
}

const shown = table => table.replace(/^public\./, '')

function refusalOf(change, tables) {
  if (change.schema)
    return [...tables.keys()]
      .filter(table => table.startsWith(`${change.schema}.`))
      .map(table => `drops table ${shown(table)}, with schema ${change.schema}`)
  const columns = tables.get(change.table)
  if (!columns || (change.column && !columns.has(change.column))) return []
  const what = change.column
    ? `${shown(change.table)}.${change.column}`
    : `table ${shown(change.table)}`
  if (change.kind === 'drops') return [`drops ${what}`]
  if (change.kind === 'moves') return [`moves ${what} to schema ${change.to}`]
  return [`renames ${what} to ${change.column ? change.to : shown(change.to)}`]
}

export const refusalsOf = (changes, tables) => changes.flatMap(change => refusalOf(change, tables))

const git = (repository, ...command) =>
  execFileSync('git', ['-C', repository, ...command], {
    encoding: 'utf8',
    env: withoutGitLocation(process.env),
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore']
  })

function read(repository, ref, path) {
  try {
    return git(repository, 'show', `${ref}:${path}`)
  } catch {
    return undefined
  }
}

function isCommit(repository, ref) {
  try {
    git(repository, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`)
    return true
  } catch {
    return false
  }
}

const journalOf = (repository, ref) =>
  JSON.parse(read(repository, ref, `${migrationsFolder}/meta/_journal.json`) ?? '{"entries":[]}')
    .entries

export function check(repository, base, head = 'HEAD') {
  const missing = [base, head].filter(ref => !isCommit(repository, ref))
  if (missing.length)
    return {
      passed: false,
      message: `${missing.join(' and ')} isn't a commit in this checkout, so nothing says what main's code reads. Fetch it, or check out two commits (fetch-depth: 2) for HEAD^1.`
    }
  const onMain = journalOf(repository, base)
  const last = onMain.at(-1)
  const snapshot =
    last && `${migrationsFolder}/meta/${String(last.idx).padStart(4, '0')}_snapshot.json`
  const kept = snapshot ? read(repository, base, snapshot) : '{}'
  if (kept === undefined)
    return {
      passed: false,
      message: `${base} names ${last.tag} last but has no ${snapshot}, so nothing says what main's code reads.`
    }
  const tables = tablesIn(JSON.parse(kept))
  const known = new Set(onMain.map(entry => entry.tag))
  const added = journalOf(repository, head).filter(entry => !known.has(entry.tag))
  const refused = added.flatMap(entry => {
    const file = `${migrationsFolder}/${entry.tag}.sql`
    return refusalsOf(changesIn(read(repository, head, file) ?? ''), tables).map(
      refusal => `${file} ${refusal}, which main's code still reads (${snapshot} has it).`
    )
  })
  if (refused.length) return { passed: false, message: `${refused.join('\n')}\n\n${migrationRule}` }
  return {
    passed: true,
    message: added.length
      ? `Checked ${added.map(entry => entry.tag).join(', ')}: none drops or renames a table or column main's code reads.`
      : `This change adds no migration to ${migrationsFolder}.`
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [base, head] = process.argv.slice(2)
  const { passed, message } = base
    ? check(process.cwd(), base, head)
    : { passed: false, message: 'Run it as: node tools/checks/migrations.mjs <base> [<head>].' }
  console.log(message)
  process.exit(passed ? 0 : 1)
}
