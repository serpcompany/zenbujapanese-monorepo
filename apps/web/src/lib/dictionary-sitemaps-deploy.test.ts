import { execFile } from 'node:child_process'
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  dictionaryContract,
  dictionaryContractHeader
} from '@zenbu/dictionary-core/artifact/contract'
import { afterEach, describe, expect, test } from 'vitest'

const site = fileURLToPath(new URL('../..', import.meta.url))
const run = promisify(execFile)
const folders: string[] = []
const servers: Server[] = []

afterEach(() => {
  for (const server of servers.splice(0)) server.close()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

function scratch(prefix: string) {
  const folder = mkdtempSync(join(tmpdir(), prefix))
  folders.push(folder)
  return folder
}

const words = [
  { entSeq: 1259290, slug: '見る' },
  { entSeq: 1259291, slug: 'a&b' }
]

type Word = { entSeq: number; slug: string }

const answers = (path: string, after: number, listed: readonly Word[]) => {
  if (path === '/v1/sitemaps/words') {
    const [first, last] = [listed[0].entSeq, listed[listed.length - 1].entSeq]
    return [{ number: 1, firstEntSeq: first, lastEntSeq: last, urlCount: listed.length }]
  }
  if (path === '/v1/sitemaps/words/1') return listed.filter(word => word.entSeq > after)
  if (path === '/v1/sitemaps/browse') {
    return { kana: [], categories: [], rankedLists: [], jlptLists: [], kanjiLists: [] }
  }
  return null
}

async function standInService(failing: string | null = null, listed: readonly Word[] = words) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const answer = answers(url.pathname, Number(url.searchParams.get('after') ?? 0), listed)
    const status = url.pathname === failing ? 500 : answer === null ? 404 : 200
    response.writeHead(status, {
      'Content-Type': 'application/json',
      [dictionaryContractHeader]: String(dictionaryContract),
      'X-Dictionary-Build': 'stand-in'
    })
    response.end(JSON.stringify(status === 200 ? answer : { error: 'no' }))
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

async function writeSitemaps(folder: string, env: Record<string, string>) {
  try {
    await run(process.execPath, ['--import', 'tsx', 'scripts/write-sitemaps.ts', folder], {
      cwd: site,
      env: { ...process.env, ...env }
    })
    return { code: 0, stderr: '' }
  } catch (error) {
    const { code, stderr } = error as { code?: number; stderr?: string }
    return { code: code ?? 1, stderr: stderr ?? '' }
  }
}

function publicFolder() {
  const folder = scratch('web-public-')
  writeFileSync(join(folder, 'favicon.ico'), 'icon')
  writeFileSync(join(folder, 'sitemap-words-9.xml'), 'stale')
  return folder
}

const service = (url: string) => ({
  SITE_ENV: 'production',
  DICTIONARY_API_URL: url,
  DICTIONARY_API_TOKEN: 'stand-in-token'
})

describe('pnpm sitemaps', () => {
  test("writes every dictionary sitemap on the site's host and replaces the old ones", async () => {
    const folder = publicFolder()
    expect((await writeSitemaps(folder, service(await standInService()))).code).toBe(0)
    expect(readdirSync(folder).sort()).toEqual([
      'favicon.ico',
      'sitemap-categories.xml',
      'sitemap-frequency-lists.xml',
      'sitemap-kana.xml',
      'sitemap-kanji-lists.xml',
      'sitemap-words.xml'
    ])
    const inBothLanguages = (path: string) => {
      const [english, japanese] = [path, `/ja${path}`].map(
        each => `https://zenbujapanese.com${each}`
      )
      const alternates =
        `<xhtml:link rel="alternate" hreflang="en" href="${english}"/>` +
        `<xhtml:link rel="alternate" hreflang="ja" href="${japanese}"/>` +
        `<xhtml:link rel="alternate" hreflang="x-default" href="${english}"/>`
      return `<url><loc>${english}</loc>${alternates}</url><url><loc>${japanese}</loc>${alternates}</url>`
    }
    expect(readFileSync(join(folder, 'sitemap-words.xml'), 'utf8')).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">' +
        inBothLanguages('/dictionary/%E8%A6%8B%E3%82%8B-1259290/') +
        inBothLanguages('/dictionary/a&amp;b-1259291/') +
        '</urlset>'
    )
  })

  test('leaves the folder as it was when the service fails partway', async () => {
    const folder = publicFolder()
    const failing = await standInService('/v1/sitemaps/words/1')
    expect((await writeSitemaps(folder, service(failing))).code).toBe(1)
    expect(readdirSync(folder).sort()).toEqual(['favicon.ico', 'sitemap-words-9.xml'])
  })

  test('refuses a sitemap larger than a Cloudflare Workers asset may be, and leaves the folder as it was', async () => {
    const folder = publicFolder()
    const long = Array.from({ length: 900 }, (_, index) => ({
      entSeq: index + 1,
      slug: 'あ'.repeat(400)
    }))
    const failed = await writeSitemaps(folder, service(await standInService(null, long)))
    expect(failed.code).toBe(1)
    expect(failed.stderr).toMatch(/^\/sitemap-words\.xml is 2\d\.\d MiB, over the 25 MiB/)
    expect(readdirSync(folder).sort()).toEqual(['favicon.ico', 'sitemap-words-9.xml'])
  })

  test('refuses to write without a deployed environment to name the host', async () => {
    const folder = publicFolder()
    const url = await standInService()
    expect((await writeSitemaps(folder, { ...service(url), SITE_ENV: '' })).code).toBe(1)
    expect(readdirSync(folder).sort()).toEqual(['favicon.ico', 'sitemap-words-9.xml'])
  })
})

function deployRunner(healthy: boolean) {
  const folder = scratch('web-deploy-sitemaps-')
  const log = join(folder, 'calls.log')
  const stub = (name: string, body: string) => {
    writeFileSync(join(folder, name), `#!/usr/bin/env bash\n${body}\n`)
    chmodSync(join(folder, name), 0o755)
  }
  stub('docker', `echo "docker $*" >>"${log}"`)
  stub('curl', healthy ? `echo '{"build":"stand-in"}'` : 'exit 7')
  stub('jq', 'echo stand-in')
  stub(
    'pnpm',
    `echo "pnpm $* SITE_ENV=$SITE_ENV DICTIONARY_API_URL=$DICTIONARY_API_URL" >>"${log}"`
  )
  const deploy = async (environment: string) => {
    try {
      await run('bash', [join(site, 'scripts/write-dictionary-sitemaps.sh'), environment], {
        cwd: folder,
        env: { ...process.env, PATH: `${folder}:${process.env.PATH}` }
      })
      return 0
    } catch (error) {
      return (error as { code?: number }).code ?? 1
    }
  }
  const calls = () => readFileSync(log, 'utf8').trim().split('\n')
  return { deploy, calls }
}

describe("Web deploy's sitemap step", () => {
  test.each([
    'staging',
    'production'
  ])("writes %s's sitemaps from that environment's service image", async environment => {
    const runner = deployRunner(true)
    expect(await runner.deploy(environment)).toBe(0)
    const image = `ghcr.io/serpcompany/zenbujapanese-dictionary-api:${environment}`
    const calls = runner.calls()
    expect(calls[0]).toBe(`docker pull --quiet ${image}`)
    expect(calls[1]).toMatch(
      new RegExp(`^docker run .*--publish 127\\.0\\.0\\.1:8788:8788 .*${image}$`)
    )
    expect(calls).toContain(
      `pnpm sitemaps SITE_ENV=${environment} DICTIONARY_API_URL=http://127.0.0.1:8788`
    )
    expect(calls.at(-1)).toBe('docker rm --force zenbujapanese-sitemaps')
  })

  test("fails without writing when the service image doesn't start", async () => {
    const runner = deployRunner(false)
    expect(await runner.deploy('staging')).toBe(1)
    expect(runner.calls().filter(call => call.startsWith('pnpm'))).toEqual([])
    expect(runner.calls().at(-1)).toBe('docker rm --force zenbujapanese-sitemaps')
  })

  test('refuses an unknown environment', async () => {
    const runner = deployRunner(true)
    expect(await runner.deploy('preview')).toBe(1)
  })
})
