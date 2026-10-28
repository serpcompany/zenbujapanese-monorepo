import { labels } from '../src/shared/labels.ts'
import { labels as sidePanelLabels } from '../src/side-panel/labels.ts'

export type ExtensionPage = {
  name: string
  path: string
  manifestKey: string
  title: string
  text: string
}

export const extensionPages: ExtensionPage[] = [
  {
    name: 'side-panel',
    path: 'pages/side-panel.html',
    manifestKey: 'side_panel.default_path',
    title: labels.name,
    text: sidePanelLabels.empty.video.title
  },
  {
    name: 'settings',
    path: 'pages/settings.html',
    manifestKey: 'options_ui.page',
    title: labels.settings.title,
    text: labels.settings.body
  }
]

export const dictionaryLabels = { ready: labels.progress.ready, ...labels.dictionary }

export const testPage = '/test-pages/hostile.html'

export const contentScriptHost = 'zenbu-japanese'

export const checkedReleaseFile = 'JLPTLevelPack.sqlite3'

export function manifestValue(manifest: unknown, key: string) {
  return key
    .split('.')
    .reduce<unknown>(
      (value, part) => (value as Record<string, unknown> | undefined)?.[part],
      manifest
    )
}

export type ReleaseCheck = {
  release: string
  manifestSha256: string
  listedSha256: string
  file: string
  fileSha256: string
  pinnedSha256: string
  bytes: number
}

export function releaseCheckFailures(check: ReleaseCheck): string[] {
  return [
    ...(check.manifestSha256 === check.listedSha256
      ? []
      : ['the manifest does not match the SHA-256 releases.json lists']),
    ...(check.fileSha256 === check.pinnedSha256
      ? []
      : ['the downloaded file does not match the manifest SHA-256'])
  ]
}

export async function downloadReleaseFile({
  base,
  release,
  name
}: {
  base: string
  release: string
  name: string
}): Promise<ReleaseCheck> {
  const hex = async (response: Response) => {
    if (!response.ok) throw new Error(`${response.url} answered ${response.status}`)
    const bytes = await response.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const sha = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0'))
    return { bytes, sha256: sha.join('') }
  }
  const index = (await (await fetch(`${base}/releases.json`)).json()) as {
    releases: { release: string; manifest_sha256: string }[]
  }
  const listed = index.releases.find(entry => entry.release === release)
  if (!listed) throw new Error(`releases.json lists no ${release}`)
  const manifest = await hex(await fetch(`${base}/releases/${release}/manifest.json`))
  const { files } = JSON.parse(new TextDecoder().decode(manifest.bytes)) as {
    files: { name: string; sha256: string }[]
  }
  const pinned = files.find(file => file.name === name)
  if (!pinned) throw new Error(`the manifest of ${release} names no ${name}`)
  const file = await hex(await fetch(`${base}/files/${pinned.sha256}/${name}`))
  return {
    release,
    manifestSha256: manifest.sha256,
    listedSha256: listed.manifest_sha256,
    file: name,
    fileSha256: file.sha256,
    pinnedSha256: pinned.sha256,
    bytes: file.bytes.byteLength
  }
}
