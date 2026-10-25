import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const fromPackage = path => fileURLToPath(new URL(`../${path}`, import.meta.url))

export const appResource = path =>
  fromPackage(`../../apps/ios/Modules/Sources/SearchExperience/Resources/${path}`)

export const bundlePath = appResource('DictionaryCore/dictionary-core.js')

export async function bundleFor(workingDirectory, entryPoint) {
  const { outputFiles } = await build({
    absWorkingDir: workingDirectory,
    entryPoints: [entryPoint],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    charset: 'utf8',
    legalComments: 'none',
    write: false,
    logLevel: 'silent'
  })
  return outputFiles[0].text
}

export const bundle = () =>
  bundleFor(fromPackage('.'), fromPackage('src/embedded/javascriptcore.ts'))

export async function writeBundle(path, made) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, await made())
  console.log(`Wrote ${path}`)
}
