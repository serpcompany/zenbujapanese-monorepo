import { spawnSync } from 'node:child_process'
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { changesIn, check, migrationRule, migrationsFolder } from '../migrations.mjs'
import { git, outsideGit, scratchFolder } from './agents/scratch'
import { workflowSteps } from './agents/workflow'
import { root } from './files'

interface Entry {
  idx: number
  version: string
  when: number
  tag: string
  breakpoints: boolean
}

interface Snapshot {
  tables: Record<string, { columns: Record<string, unknown> }>
}

const writtenByDrizzleKit = {
  dropColumn: 'ALTER TABLE "users" DROP COLUMN "language";',
  dropColumns:
    'ALTER TABLE "translation_bookmarks" DROP COLUMN "language";--> statement-breakpoint\nALTER TABLE "users" DROP COLUMN "language";',
  renameColumn: 'ALTER TABLE "users" RENAME COLUMN "language" TO "locale";',
  renameTable: 'ALTER TABLE "sync_origin" RENAME TO "database_origin";',
  dropTable: 'DROP TABLE "sync_origin" CASCADE;'
}

const metaOf = (repository: string) => join(repository, migrationsFolder, 'meta')
const snapshotFile = (idx: number) => `${String(idx).padStart(4, '0')}_snapshot.json`
const journalOf = (repository: string): Entry[] =>
  JSON.parse(readFileSync(join(metaOf(repository), '_journal.json'), 'utf8')).entries
const realJournal = journalOf(root)
const lastSnapshot = (): Snapshot =>
  JSON.parse(readFileSync(join(metaOf(root), snapshotFile(realJournal.length - 1)), 'utf8'))

function writeJournal(repository: string, entries: Entry[]) {
  writeFileSync(
    join(metaOf(repository), '_journal.json'),
    `${JSON.stringify({ version: '7', dialect: 'postgresql', entries }, null, 2)}\n`
  )
}

function commit(repository: string): string {
  git(repository, 'add', '--all')
  git(repository, 'commit', '--quiet', '--allow-empty', '-m', 'step')
  return git(repository, 'rev-parse', 'HEAD').stdout.trim()
}

function writeMainsMigrations(repository: string, count: number) {
  rmSync(join(repository, migrationsFolder), { recursive: true, force: true })
  cpSync(join(root, migrationsFolder), join(repository, migrationsFolder), { recursive: true })
  for (const entry of realJournal.slice(count)) {
    rmSync(join(repository, migrationsFolder, `${entry.tag}.sql`))
    rmSync(join(metaOf(repository), snapshotFile(entry.idx)))
  }
  writeJournal(repository, realJournal.slice(0, count))
  return commit(repository)
}

function repositoryWithTheMigrations(count = realJournal.length) {
  const repository = scratchFolder('migrations')
  git(repository, 'init', '--quiet', '--initial-branch=main')
  return { repository, main: writeMainsMigrations(repository, count) }
}

function addMigration(repository: string, tag: string, sql: string, snapshot = lastSnapshot()) {
  const entries = journalOf(repository)
  const idx = entries.length
  writeFileSync(join(repository, migrationsFolder, `${tag}.sql`), sql)
  writeFileSync(join(metaOf(repository), snapshotFile(idx)), JSON.stringify(snapshot, null, 2))
  writeJournal(repository, [
    ...entries,
    { idx, version: '7', when: 1792993476902 + idx, tag, breakpoints: true }
  ])
  return commit(repository)
}

function withoutColumn(table: string, column: string): Snapshot {
  const snapshot = lastSnapshot()
  delete snapshot.tables[`public.${table}`].columns[column]
  return snapshot
}

describe('what a migration drops or renames', () => {
  test.each([
    [
      'a column leaving the schema',
      'dropColumn',
      [{ kind: 'drops', table: 'public.users', column: 'language' }]
    ],
    [
      'two columns of one name leaving the schema',
      'dropColumns',
      [
        { kind: 'drops', table: 'public.translation_bookmarks', column: 'language' },
        { kind: 'drops', table: 'public.users', column: 'language' }
      ]
    ],
    [
      'a column renamed, answering its prompt',
      'renameColumn',
      [{ kind: 'renames', table: 'public.users', column: 'language', to: 'locale' }]
    ],
    [
      'a table renamed, answering its prompt',
      'renameTable',
      [{ kind: 'renames', table: 'public.sync_origin', to: 'public.database_origin' }]
    ],
    ['a table leaving the schema', 'dropTable', [{ kind: 'drops', table: 'public.sync_origin' }]]
  ] as const)('reads what drizzle-kit 0.31 writes for %s', (_, written, changes) => {
    expect(changesIn(writtenByDrizzleKit[written])).toEqual(changes)
  })

  test("reads no change from every migration on main, which only add, or from a function's body", () => {
    for (const entry of realJournal) {
      const sql = readFileSync(join(root, migrationsFolder, `${entry.tag}.sql`), 'utf8')
      expect(changesIn(sql), entry.tag).toEqual([])
    }
  })

  test.each([
    [
      'in any case, unquoted, with its schema',
      'alter table public.Users drop language',
      'public.users',
      'language'
    ],
    [
      'with IF EXISTS and no COLUMN',
      'ALTER TABLE IF EXISTS ONLY "users" DROP IF EXISTS "image" CASCADE',
      'public.users',
      'image'
    ],
    [
      'after another action in the same statement',
      'ALTER TABLE "users" ADD COLUMN "x" text, DROP COLUMN "image"',
      'public.users',
      'image'
    ],
    [
      'inside a block that runs at once',
      'DO $$ BEGIN ALTER TABLE "users" DROP COLUMN "image"; END $$;',
      'public.users',
      'image'
    ],
    [
      "after a string holding a comment's dashes",
      `ALTER TABLE "users" ADD COLUMN "x" text DEFAULT 'a--b;'; ALTER TABLE "users" DROP COLUMN "image";`,
      'public.users',
      'image'
    ],
    [
      'after an action whose default is a closing bracket',
      `ALTER TABLE "users" ADD COLUMN "x" text DEFAULT ')', DROP COLUMN "language";`,
      'public.users',
      'language'
    ],
    [
      'after an action whose quoted name holds an opening bracket',
      `ALTER TABLE "users" ADD COLUMN "x(" text, DROP COLUMN "language";`,
      'public.users',
      'language'
    ]
  ])('reads a dropped column written %s', (_, sql, table, column) => {
    expect(changesIn(sql)).toContainEqual({ kind: 'drops', table, column })
  })

  test("splits an ALTER TABLE's actions only at commas outside quotes", () => {
    expect(
      changesIn(
        `ALTER TABLE "users" ADD COLUMN "x" text DEFAULT 'a, DROP COLUMN "image"', DROP COLUMN "language";`
      )
    ).toEqual([{ kind: 'drops', table: 'public.users', column: 'language' }])
  })

  test.each([
    ['a constraint dropped', 'ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";'],
    ['a constraint renamed', 'ALTER TABLE "users" RENAME CONSTRAINT "a" TO "b";'],
    [
      "a column's default and NOT NULL dropped",
      'ALTER TABLE "users" ALTER COLUMN "image" DROP DEFAULT, ALTER COLUMN "image" DROP NOT NULL;'
    ],
    ['an index dropped', 'DROP INDEX "users_email_ignoring_case";'],
    [
      'a drop in a comment',
      '-- ALTER TABLE "users" DROP COLUMN "image";\n/* DROP TABLE "users"; */'
    ],
    ['a tablespace dropped', 'DROP TABLESPACE "fast";']
  ])('reads nothing from %s', (_, sql) => {
    expect(changesIn(sql)).toEqual([])
  })
})

describe('the migration check', () => {
  test.each([
    ['dropColumn', 'drops users.language'],
    ['renameColumn', 'renames users.language to locale'],
    ['renameTable', 'renames table sync_origin to database_origin'],
    ['dropTable', 'drops table sync_origin']
  ] as const)("refuses drizzle-kit's %s of what main's code reads", (written, refusal) => {
    const { repository, main } = repositoryWithTheMigrations()
    const head = addMigration(repository, '0009_change', writtenByDrizzleKit[written])
    const { passed, message } = check(repository, main, head)
    expect(passed).toBe(false)
    expect(message).toContain(
      `${migrationsFolder}/0009_change.sql ${refusal}, which main's code still reads (${migrationsFolder}/meta/${snapshotFile(realJournal.length - 1)} has it).`
    )
    expect(message).toContain(migrationRule)
  })

  test('passes each migration on main as it was added, on the snapshot before it', () => {
    const { repository, main } = repositoryWithTheMigrations(0)
    let base = main
    for (const count of realJournal.map((_, index) => index + 1)) {
      const head = writeMainsMigrations(repository, count)
      const tag = realJournal[count - 1].tag
      expect(check(repository, base, head), tag).toEqual({
        passed: true,
        message: `Checked ${tag}: none drops or renames a table or column main's code reads.`
      })
      base = head
    }
  })

  test('passes a drop once main has taken the column out of its schema and its snapshot', () => {
    const { repository } = repositoryWithTheMigrations()
    const main = addMigration(
      repository,
      '0009_stop_reading_language',
      '',
      withoutColumn('users', 'language')
    )
    const head = addMigration(
      repository,
      '0010_drop_language',
      writtenByDrizzleKit.dropColumn,
      withoutColumn('users', 'language')
    )
    expect(check(repository, main, head).passed).toBe(true)
  })

  test('refuses a migration the journal names whose SQL file is missing, naming the file', () => {
    const { repository, main } = repositoryWithTheMigrations()
    addMigration(repository, '0009_lost', 'ALTER TABLE "users" ADD COLUMN "locale" text;')
    rmSync(join(repository, migrationsFolder, '0009_lost.sql'))
    const head = commit(repository)
    const { passed, message } = check(repository, main, head)
    expect(passed).toBe(false)
    expect(message).toContain(`${migrationsFolder}/0009_lost.sql`)
  })

  test('says when a change adds no migration, and refuses a base it cannot read', () => {
    const { repository, main } = repositoryWithTheMigrations()
    expect(check(repository, main, main)).toEqual({
      passed: true,
      message: `This change adds no migration to ${migrationsFolder}.`
    })
    const missing = check(repository, 'no-such-branch', main)
    expect(missing.passed).toBe(false)
    expect(missing.message).toContain("no-such-branch isn't a commit in this checkout")
  })

  test('runs as the Repository workflow runs it, against the commit before', () => {
    const { repository } = repositoryWithTheMigrations()
    const run = () =>
      spawnSync(process.execPath, [join(root, 'tools', 'checks', 'migrations.mjs'), 'HEAD^1'], {
        cwd: repository,
        encoding: 'utf8',
        env: outsideGit()
      })
    addMigration(repository, '0009_add_locale', 'ALTER TABLE "users" ADD COLUMN "locale" text;')
    expect(run()).toMatchObject({ status: 0 })
    addMigration(repository, '0010_drop_language', writtenByDrizzleKit.dropColumn)
    const refused = run()
    expect(refused.status).toBe(1)
    expect(refused.stdout).toContain('0010_drop_language.sql drops users.language')
  })

  test('runs in the Repository workflow on the commit before, which its checkout fetches', () => {
    const steps = workflowSteps('.github/workflows/repository.yml', 'verify')
    expect(steps[0].with?.['fetch-depth']).toBe(2)
    expect(steps.map(step => step.run)).toContain('node tools/checks/migrations.mjs HEAD^1')
  })
})
