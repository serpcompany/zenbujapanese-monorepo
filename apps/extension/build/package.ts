import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { packageFolder, packageKindFrom, packageKinds } from './packages.ts'

const [kind, folder, zip] = process.argv.slice(2)

if (folder === undefined || zip === undefined) {
  console.error(`Usage: pnpm package <${packageKinds.join('|')}> <built folder> <zip to write>`)
  process.exit(2)
}

await mkdir(dirname(zip), { recursive: true })
await writeFile(zip, await packageFolder(packageKindFrom(kind), folder))
console.log(`Wrote the ${kind} package of ${folder} to ${zip}.`)
