import { hostProblems } from './host-checks.ts'
import { environmentFrom, environments } from './hosts.ts'

const [environment] = process.argv.slice(2)

if (environment === undefined) {
  console.error(`Usage: pnpm check-hosts <${environments.join('|')}>`)
  process.exit(2)
}

const problems = await hostProblems(environmentFrom(environment), fetch)

if (problems.length > 0) {
  console.error(`A ${environment} build can't sign in:`)
  for (const problem of problems) console.error(`- ${problem}`)
  process.exit(1)
}

console.log(
  `A ${environment} build can sign in: the handover page and the extension's sign-in answer.`
)
