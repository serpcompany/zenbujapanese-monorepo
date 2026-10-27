import { readFile } from 'node:fs/promises'
import { environmentFrom, environments } from './hosts.ts'
import { packageKindFrom, packageKinds, packageProblems } from './packages.ts'

const [kind, environment, zip] = process.argv.slice(2)

if (environment === undefined || zip === undefined) {
  console.error(
    `Usage: pnpm check-package <${packageKinds.join('|')}> <${environments.join('|')}> <zip>`
  )
  process.exit(2)
}

const problems = packageProblems(
  await readFile(zip),
  packageKindFrom(kind),
  environmentFrom(environment)
)

if (problems.length > 0) {
  console.error(`${zip} isn't a ${environment} ${kind} package:`)
  for (const problem of problems) console.error(`- ${problem}`)
  process.exit(1)
}

console.log(`${zip} is a ${environment} ${kind} package.`)
