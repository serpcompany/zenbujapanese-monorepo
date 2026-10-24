import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { describe, expect, test } from 'vitest'
import {
  python,
  runStep,
  type Served,
  standInEdrdg,
  stepNamed,
  uvRunsPython
} from './agents/jmdict-update-world'
import { scratchFolder } from './agents/scratch'
import { root } from './files'

const download = stepNamed(
  "Download today's JMdict from EDRDG and compare it with the pinned export"
)
const fixtures = join(root, 'language-data/tools/tests/fixtures')
const withExamplesXml = readFileSync(join(fixtures, 'jmdict-e-examp-2026-10-23-excerpt.xml'))
const withoutExamplesXml = readFileSync(join(fixtures, 'jmdict-e-2026-10-23-excerpt.xml'))
const sources = join(root, 'language-data/sources')
const pinnedRecord = JSON.parse(
  readFileSync(
    join(
      sources,
      readdirSync(sources).find(name => /^JMdict_e_examp-.*\.source\.json$/.test(name)) ?? ''
    ),
    'utf8'
  )
) as Record<string, unknown> & { without_examples: Record<string, unknown> }
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex')
const withExamples = gzipSync(withExamplesXml)
const withoutExamples = gzipSync(withoutExamplesXml)
const paths = { with: '/pub/Nihongo/JMdict_e_examp.gz', without: '/pub/Nihongo/JMdict_e.gz' }

function checkout(base: string, pinned: Record<string, unknown>): string {
  const folder = scratchFolder('jmdict-checkout')
  for (const part of ['language-data/tools', 'language-data/pipeline']) {
    cpSync(join(root, part), join(folder, part), {
      recursive: true,
      filter: source => !/\/(tests|__pycache__)(\/|$)/.test(source)
    })
  }
  mkdirSync(join(folder, 'language-data/sources'))
  const record: Record<string, unknown> = {
    ...pinnedRecord,
    download_url: `${base}${paths.with}`,
    ...pinned,
    without_examples: { ...pinnedRecord.without_examples, download_url: `${base}${paths.without}` }
  }
  writeFileSync(
    join(folder, `language-data/sources/JMdict_e_examp-${String(record.export_date)}.source.json`),
    `${JSON.stringify(record, null, 2)}\n`
  )
  return folder
}

async function downloaded(
  pinned: Record<string, unknown>,
  served: Served = { [paths.with]: withExamples, [paths.without]: withoutExamples }
) {
  expect(python, "The workflow's scripts need Python 3.12 or later on PATH").toBeDefined()
  return standInEdrdg(served, async base => {
    const folder = checkout(base, pinned)
    const run = await runStep(download, {
      cwd: folder,
      env: { WORK: join(folder, 'tmp/jmdict-update') },
      standIns: { uv: uvRunsPython(python ?? 'python3') }
    })
    return { ...run, folder }
  })
}

const olderExport = { export_date: '2026-10-22', sha256: '0'.repeat(64) }

const refusal = (output: string) =>
  /::error title=JMdict wasn't updated::(.*)/.exec(output)?.[1] ?? ''

describe("the JMdict update's download step, against a stand-in for EDRDG", () => {
  test('goes on to the update when EDRDG has a newer export than the pin, naming its branch', async () => {
    const { status, githubEnv, output, folder } = await downloaded(olderExport)
    expect(status, output).toBe(0)
    expect(githubEnv).toBe('UPDATE=true\nEXPORT_DATE=2026-10-23\nBRANCH=feat/jmdict-2026-10-23\n')
    expect(output).toContain("EDRDG's 2026-10-23 export follows the pinned 2026-10-22 one.")
    const export_ = join(folder, 'tmp/jmdict-update/export')
    expect(readFileSync(join(export_, 'JMdict_e_examp.gz'))).toEqual(withExamples)
    const candidate = JSON.parse(readFileSync(join(export_, 'export.json'), 'utf8'))
    expect(candidate).toMatchObject({
      export_date: '2026-10-23',
      sha256: sha256(withExamples),
      compressed_bytes: withExamples.length,
      http_last_modified: 'Sun, 01 Nov 2026 03:30:24 GMT',
      without_examples: {
        sha256: sha256(withoutExamples),
        xml_bytes: withoutExamplesXml.length,
        xml_sha256: sha256(withoutExamplesXml)
      }
    })
  })

  test('stops with a notice, and goes no further, when the export is still the pinned one', async () => {
    const { status, githubEnv, output } = await downloaded({
      export_date: '2026-10-23',
      sha256: sha256(withExamples)
    })
    expect(status, output).toBe(0)
    expect(githubEnv).toBe('')
    expect(output).toContain(
      "::notice title=JMdict is current::EDRDG's export is still the pinned 2026-10-23 one, so nothing changed and no pull request opens."
    )
  })

  test("fails, saying why, when the export without its examples is not that day's JMdict_e", async () => {
    const lastEntry = withoutExamplesXml.lastIndexOf('<entry>')
    const shorter = Buffer.concat([
      withoutExamplesXml.subarray(0, lastEntry),
      Buffer.from('</JMdict>\n')
    ])
    const { status, githubEnv, output } = await downloaded(olderExport, {
      [paths.with]: withExamples,
      [paths.without]: gzipSync(shorter)
    })
    expect(status).toBe(1)
    expect(githubEnv).toBe('')
    expect(refusal(output)).toContain(
      "EDRDG's 2026-10-23 JMdict_e_examp.gz without its example blocks isn't that day's JMdict_e.gz"
    )
  })

  test("fails when EDRDG's two files are from different days", async () => {
    const dayBefore = Buffer.from(
      withoutExamplesXml
        .toString('utf8')
        .replace('JMdict created: 2026-10-23', 'JMdict created: 2026-10-22')
    )
    const { status, output } = await downloaded(olderExport, {
      [paths.with]: withExamples,
      [paths.without]: gzipSync(dayBefore)
    })
    expect(status).toBe(1)
    expect(refusal(output)).toContain(
      "EDRDG's files are from different days: JMdict_e_examp.gz is the 2026-10-23 export and JMdict_e.gz the 2026-10-22 one."
    )
  })

  test('fails, changing nothing, when a download fails', async () => {
    const { status, output, folder } = await downloaded(olderExport, {
      [paths.with]: withExamples,
      [paths.without]: 503
    })
    expect(status).toBe(1)
    expect(refusal(output)).toMatch(
      /^Couldn't download http:\/\/127\.0\.0\.1:\d+\/pub\/Nihongo\/JMdict_e\.gz from EDRDG: HTTP Error 503/
    )
    expect(existsSync(join(folder, 'tmp/jmdict-update/export/export.json'))).toBe(false)
  })

  test('fails when a download is not a whole gzip file', async () => {
    const { status, output } = await downloaded(olderExport, {
      [paths.with]: withExamples.subarray(0, Math.floor(withExamples.length / 2)),
      [paths.without]: withoutExamples
    })
    expect(status).toBe(1)
    expect(refusal(output)).toContain("EDRDG's JMdict_e_examp.gz isn't a whole gzip file")
  })

  test('fails when EDRDG serves an older export than the pin, or other bytes under its date', async () => {
    const older = await downloaded({ export_date: '2026-10-24', sha256: '0'.repeat(64) })
    expect(older.status).toBe(1)
    expect(refusal(older.output)).toContain(
      'EDRDG serves the 2026-10-23 export, older than the pinned 2026-10-24 one.'
    )
    const sameDay = await downloaded({ export_date: '2026-10-23', sha256: '0'.repeat(64) })
    expect(sameDay.status).toBe(1)
    expect(refusal(sameDay.output)).toContain(
      "EDRDG's 2026-10-23 export isn't the file pinned under that date"
    )
  })

  test("fails when JMdict's DTD revision moved, so the importer is checked first", async () => {
    const { status, output } = await downloaded({ ...olderExport, dtd_revision: '1.08' })
    expect(status).toBe(1)
    expect(refusal(output)).toContain(
      "EDRDG's 2026-10-23 export uses JMdict's DTD revision 1.09, not 1.08"
    )
  })
})
