import { createWriteStream } from 'node:fs'
import { copyFile, mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { browseService } from '@zenbu/dictionary-core/browse/service-paths'
import { dictionaryApi } from '../src/lib/dictionary/api'
import { isDictionarySitemapFile } from '../src/lib/dictionary/sitemap-files'
import { dictionarySitemaps, type SitemapFile } from '../src/lib/dictionary/sitemaps'
import { isDeployedSite, siteOrigin } from '../src/lib/site'

const folder = resolve(process.argv[2] ?? 'public')

async function readSitemaps(): Promise<SitemapFile[]> {
  if (!isDeployedSite()) {
    throw new Error("Set SITE_ENV to staging or production: the sitemaps list that site's URLs")
  }
  const api = dictionaryApi(process.env)
  if (!api)
    throw new Error('Set DICTIONARY_API_URL and DICTIONARY_API_TOKEN to a dictionary service')
  return dictionarySitemaps(
    {
      wordSitemaps: api.wordSitemaps,
      sitemapWords: api.sitemapWords,
      browseSitemap: () => api.browse(browseService.sitemap())
    },
    siteOrigin()
  )
}

const workersAssetBytes = 25 * 1024 * 1024

async function writeAll(files: SitemapFile[], into: string) {
  for (const file of files) {
    const path = join(into, file.path.slice(1))
    await pipeline(Readable.from(file.xml()), createWriteStream(path))
    const { size } = await stat(path)
    if (size > workersAssetBytes) {
      throw new Error(
        `${file.path} is ${(size / 1024 / 1024).toFixed(1)} MiB, over the 25 MiB a Cloudflare Workers asset may be: lower wordsPerSitemap in src/lib/dictionary/sitemaps.ts`
      )
    }
  }
}

async function replaceSitemaps(files: SitemapFile[], from: string) {
  for (const name of await readdir(folder)) {
    if (isDictionarySitemapFile(name)) await rm(join(folder, name))
  }
  for (const file of files) {
    const name = file.path.slice(1)
    await copyFile(join(from, name), join(folder, name))
    console.log(`Wrote ${file.path}: ${file.urls} URLs on ${siteOrigin()}`)
  }
}

async function writeDictionarySitemaps() {
  const files = await readSitemaps()
  const written = await mkdtemp(join(tmpdir(), 'zenbu-sitemaps-'))
  try {
    await writeAll(files, written)
    await replaceSitemaps(files, written)
  } finally {
    await rm(written, { recursive: true, force: true })
  }
}

writeDictionarySitemaps().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
