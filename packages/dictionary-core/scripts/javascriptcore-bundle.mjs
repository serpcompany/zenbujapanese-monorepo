import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const fromPackage = path => fileURLToPath(new URL(`../${path}`, import.meta.url))

export const bundlePath = fromPackage(
  '../../apps/ios/Modules/Sources/SearchExperience/Resources/DictionaryCore/dictionary-core.js'
)

export async function bundle() {
  const { outputFiles } = await build({
    absWorkingDir: fromPackage('.'),
    entryPoints: [fromPackage('src/embedded/javascriptcore.ts')],
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
