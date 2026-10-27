import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, openSync, readdirSync, readFileSync, readSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url))

const languageData = join(repositoryRoot, 'language-data')
const releaseId = /^\d{4}\.\d{2}\.\d+$/
const gitLfsPointer = 'version https://git-lfs.github.com/spec/v1'

type ReleaseInputs = { roots: Record<string, string>; files: { name: string; path: string }[] }
type ManifestFile = { name: string; sha256: string }

type ReleaseFile = { name: string; path: string; sha256: string }

export type LocalRelease = {
  release: string
  releasesJson: string
  manifests: Map<string, Buffer>
  files: Map<string, ReleaseFile>
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

function byReleaseOrder(a: string, b: string) {
  const [left, right] = [a, b].map(id => id.split('.').map(Number))
  return left.reduce((order, part, index) => order || part - right[index], 0)
}

function lastCommit(path: string) {
  const [commit, seconds] = execFileSync('git', ['log', '-1', '--format=%H %ct', '--', path], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  })
    .trim()
    .split(' ')
  const publishedAt = new Date(Number(seconds) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  return { commit, publishedAt }
}

function inputPath(inputs: ReleaseInputs, name: string) {
  const input = inputs.files.find(file => file.name === name)
  if (!input) throw new Error(`language-data/release-inputs.json names no file ${name}`)
  const [root, ...rest] = input.path.split('/')
  return join(repositoryRoot, inputs.roots[root], ...rest)
}

export function isGitLfsPointer(path: string) {
  const start = Buffer.alloc(gitLfsPointer.length)
  const file = openSync(path, 'r')
  try {
    readSync(file, start, 0, start.length, 0)
  } finally {
    closeSync(file)
  }
  return start.toString('utf8') === gitLfsPointer
}

export function localRelease(): LocalRelease {
  const { release } = readJson<{ release: string }>(join(languageData, 'release.json'))
  const releases = readdirSync(join(languageData, 'releases'))
    .filter(id => releaseId.test(id) && byReleaseOrder(id, release) <= 0)
    .sort(byReleaseOrder)
  const manifests = new Map(
    releases.map(id => [id, readFileSync(join(languageData, 'releases', id, 'manifest.json'))])
  )
  const entries = releases.map(id => {
    const { commit, publishedAt } = lastCommit(`language-data/releases/${id}/manifest.json`)
    const bytes = manifests.get(id) ?? Buffer.alloc(0)
    return {
      release: id,
      manifest_sha256: createHash('sha256').update(bytes).digest('hex'),
      git_commit: commit,
      published_at: publishedAt
    }
  })
  const inputs = readJson<ReleaseInputs>(join(languageData, 'release-inputs.json'))
  const pinned = JSON.parse(String(manifests.get(release))) as { files: ManifestFile[] }
  const files = new Map(
    pinned.files.map(file => [
      `${file.sha256}/${file.name}`,
      { name: file.name, sha256: file.sha256, path: inputPath(inputs, file.name) }
    ])
  )
  const releasesJson = JSON.stringify({
    index_schema: 'zenbu.language-data-releases.v1',
    releases: entries
  })
  return { release, releasesJson, manifests, files }
}
