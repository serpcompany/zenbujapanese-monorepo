import { checkNames, failureReport, runChecks, selectFiles } from './checks'
import { root } from './files'

const [requested, ...paths] = process.argv.slice(2)
const names = requested ? requested.split(',') : checkNames
const unknown = names.filter(name => !checkNames.includes(name))
if (unknown.length) {
  console.error(`Unknown check ${unknown.join(', ')}. Run any of: ${checkNames.join(', ')}.`)
  process.exit(2)
}
const { files, prefixes } = selectFiles(paths)
if (paths.length && !files.length) {
  console.error(
    `No repository file is under ${paths.join(', ')}. Name paths relative to the repository root.`
  )
  process.exit(2)
}
const outcomes = await runChecks(names, files, prefixes)
const report = failureReport(outcomes)
if (report) console.log(report)
console.log(
  `\n${outcomes.map(outcome => `${outcome.name} ${outcome.passed ? 'passed' : 'failed'}`).join(', ')} (${root})`
)
process.exit(outcomes.every(outcome => outcome.passed) ? 0 : 1)
