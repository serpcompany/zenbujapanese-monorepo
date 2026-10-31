import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { builtPages } from './extension-config.ts'
import {
  type Environment,
  environments,
  hosts,
  testApiHost,
  testLanguageDataHost
} from './hosts.ts'
import { extensionIdOf, storeExtensionId } from './key.ts'
import {
  builtContentScripts,
  contentScriptFile,
  contentScripts,
  extensionVersion
} from './manifest.ts'
import { unzipFiles, type ZipEntry, zipFiles } from './zip.ts'

export const packageKinds = ['store', 'unpacked'] as const

export type PackageKind = (typeof packageKinds)[number]

const publishedVersion = '1.1.0'

type BuiltManifest = {
  version?: string
  key?: string
  homepage_url?: string
  icons?: Record<string, string>
  action?: { default_popup?: string; default_icon?: Record<string, string> }
  side_panel?: { default_path?: string }
  options_ui?: { page?: string }
  background?: { service_worker?: string }
  content_scripts?: { js?: string[] }[]
  externally_connectable?: { matches?: string[] }
}

const manifestFile = 'manifest.json'
const textFile = /\.(js|html|css|json)$/
const buildSettingMark = '__ZENBU_'
const releaseScripts = builtContentScripts('release').map(contentScriptFile)
const testOnlyScripts = contentScripts('test')
  .map(contentScriptFile)
  .filter(file => !releaseScripts.includes(file))

export function packageKindFrom(value: string | undefined): PackageKind {
  const kind = packageKinds.find(each => each === value)
  if (kind) return kind
  throw new Error(`The package is ${value}; it can be ${packageKinds.join(' or ')}.`)
}

async function filesIn(folder: string): Promise<ZipEntry[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true })
  const files = entries
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name))
  return Promise.all(
    files.sort().map(async file => ({
      path: relative(folder, file).split(sep).join('/'),
      data: await readFile(file)
    }))
  )
}

function withoutKey(data: Buffer): Buffer {
  const { key: _key, ...manifest } = JSON.parse(data.toString('utf8'))
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
}

export async function packageFolder(kind: PackageKind, folder: string): Promise<Buffer> {
  const files = await filesIn(folder)
  if (kind === 'unpacked') return zipFiles(files)
  return zipFiles(
    files.map(file =>
      file.path === manifestFile ? { ...file, data: withoutKey(file.data) } : file
    )
  )
}

function isAbove(version: string, other: string): boolean {
  const parts = (each: string) => each.split('.').map(Number)
  const [mine, theirs] = [parts(version), parts(other)]
  for (let index = 0; index < Math.max(mine.length, theirs.length); index++) {
    const difference = (mine[index] ?? 0) - (theirs[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return false
}

function versionProblems({ version = '' }: BuiltManifest): string[] {
  return [
    ...(version === extensionVersion
      ? []
      : [`The manifest's version is ${version}, not package.json's ${extensionVersion}.`]),
    ...(isAbove(version, publishedVersion)
      ? []
      : [
          `The version ${version} isn't above ${publishedVersion}, the Chrome Web Store's, so the store would refuse it as an update.`
        ])
  ]
}

function keyProblems(kind: PackageKind, { key }: BuiltManifest): string[] {
  if (kind === 'store') {
    return key === undefined
      ? []
      : [
          'The store package has a key: the Chrome Web Store gives the item its ID, and refuses one.'
        ]
  }
  if (key === undefined)
    return [`The unpacked package has no key, so its ID isn't ${storeExtensionId}.`]
  const id = extensionIdOf(key)
  return id === storeExtensionId ? [] : [`The key gives the ID ${id}, not ${storeExtensionId}.`]
}

function namedFiles(manifest: BuiltManifest): string[] {
  return [
    ...Object.values(manifest.icons ?? {}),
    ...Object.values(manifest.action?.default_icon ?? {}),
    manifest.action?.default_popup,
    manifest.side_panel?.default_path,
    manifest.options_ui?.page,
    manifest.background?.service_worker,
    ...(manifest.content_scripts ?? []).flatMap(script => script.js ?? [])
  ].filter(file => file !== undefined)
}

function fileProblems(files: Map<string, Buffer>, manifest: BuiltManifest): string[] {
  const named = namedFiles(manifest)
  const missing = [...new Set([...builtPages, ...named, ...releaseScripts])].filter(
    file => !files.has(file)
  )
  const testOnly = testOnlyScripts.filter(file => files.has(file) || named.includes(file))
  const maps = [...files.keys()].filter(file => file.endsWith('.map'))
  return [
    ...(missing.length === 0 ? [] : [`The package is missing ${missing.join(', ')}.`]),
    ...(testOnly.length === 0
      ? []
      : [`The package holds the test build's ${testOnly.join(', ')}.`]),
    ...(maps.length === 0 ? [] : [`The package holds source maps: ${maps.join(', ')}.`])
  ]
}

function hostProblems(
  files: Map<string, Buffer>,
  manifest: BuiltManifest,
  environment: Environment
): string[] {
  const website = hosts[environment].website
  const own: string[] = Object.values(hosts[environment])
  const others = [
    ...environments
      .filter(other => other !== environment)
      .flatMap(other => Object.values(hosts[other]).map(origin => ({ other, origin }))),
    { other: 'the test build', origin: testLanguageDataHost },
    { other: 'the test build', origin: testApiHost }
  ].filter(({ origin }) => !own.includes(origin))
  const messaging = manifest.externally_connectable?.matches ?? []
  const websitePages = `${website}/*`
  return [
    ...(manifest.homepage_url === website
      ? []
      : [`The manifest's homepage_url is ${manifest.homepage_url}, not ${website}.`]),
    ...(messaging.length === 1 && messaging[0] === websitePages
      ? []
      : [
          `The manifest lets ${messaging.join(', ') || 'no page'} message the extension, not ${websitePages} alone.`
        ]),
    ...others.flatMap(({ other, origin }) => {
      const naming = [...files]
        .filter(([file, data]) => textFile.test(file) && data.includes(origin))
        .map(([file]) => file)
      return naming.length === 0 ? [] : [`${other}'s ${origin} is in ${naming.join(', ')}.`]
    })
  ]
}

function buildSettingProblems(files: Map<string, Buffer>): string[] {
  const unfilled = [...files]
    .filter(([file, data]) => file.endsWith('.js') && data.includes(buildSettingMark))
    .map(([file]) => file)
  return unfilled.length === 0
    ? []
    : [`The build left a ${buildSettingMark} setting unfilled in ${unfilled.join(', ')}.`]
}

export function packageProblems(
  zip: Buffer,
  kind: PackageKind,
  environment: Environment
): string[] {
  const files = unzipFiles(zip)
  const manifestData = files.get(manifestFile)
  if (!manifestData) return [`The package has no ${manifestFile}.`]
  const manifest: BuiltManifest = JSON.parse(manifestData.toString('utf8'))
  return [
    ...versionProblems(manifest),
    ...keyProblems(kind, manifest),
    ...fileProblems(files, manifest),
    ...hostProblems(files, manifest, environment),
    ...buildSettingProblems(files)
  ]
}
