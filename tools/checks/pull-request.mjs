import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const types = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore']
const conventional = new RegExp(`^(?:${types.join('|')})(?:\\([a-z0-9][a-z0-9-]*\\))?!?: \\S`)

export const isConventionalTitle = title => conventional.test(title)

export const titleRule = `A pull request's title is a Conventional Commit that names the outcome a user notices, such as "fix: Escape closes the Settings window" (docs/agents/code.md, Pull requests). Start it with one of ${types.join(', ')}, then an optional scope in brackets, a colon, and a space.`

export const noIssueReason = body => /^No issue: *\S.*$/im.exec(body)?.[0]

export const issueRule =
  'A pull request closes the issue it finishes, so an open issue always means work is left (docs/agents/code.md, Pull requests). Start the body with Closes #<number>, one line per issue, or say why there is none on a line of its own: No issue: <reason>. "Part of #N" and "Refs #N" close nothing.'

export const otherBase = (base, defaultBranch) =>
  base && defaultBranch && base !== defaultBranch
    ? `This pull request is based on ${base}, not ${defaultBranch}, and GitHub links a closing keyword only on a pull request into ${defaultBranch}. The check passes once it is retargeted, which GitHub does when its parent merges.`
    : ''

const testPaths = [
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /(^|\/)test_[^/]+\.py$/,
  /^apps\/web\/scripts\/smoke\.sh$/,
  /^apps\/ios\/(?:Modules\/Tests|UITests|Tools\/TranslateReplay\/Tests)\/(?:.+\/)?[^/]+Tests\.swift$/,
  /^apps\/ios\/LanguageData\/Conformance\/[^/]+\.json$/
]

export const isTest = path => testPaths.some(pattern => pattern.test(path))

const fixTitle = /^fix(?:\([^)]*\))?!?:/

export const isFix = (branch, title) => branch.startsWith('fix/') || fixTitle.test(title)

export const fixRule =
  "A pull request from a fix/ branch, or titled fix:, fixes a bug, so it adds or changes the test that fails without the fix (docs/agents/code.md, Fixes): a unit test, a browser test, a UI test, a conformance case, or a smoke check. If nothing can fail without this change (a typo, a workflow setting), it isn't a fix: give it another type, such as chore or docs."

export const fixWithoutTest = (branch, title, changed) =>
  isFix(branch, title) && !changed.some(isTest)

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

function changedFiles(number, repository) {
  return execFileSync(
    'gh',
    [
      'api',
      `repos/${repository}/pulls/${number}/files`,
      '--paginate',
      '--jq',
      '.[] | select(.status != "removed") | .filename'
    ],
    { encoding: 'utf8' }
  )
    .split('\n')
    .filter(Boolean)
}

function closedIssues(number, repository) {
  try {
    return execFileSync(
      'gh',
      [
        'pr',
        'view',
        number,
        '--repo',
        repository,
        '--json',
        'closingIssuesReferences',
        '--jq',
        '[.closingIssuesReferences[].number | "#\\(.)"] | join(" ")'
      ],
      { encoding: 'utf8' }
    ).trim()
  } catch {
    return ''
  }
}

async function check(name, environment) {
  if (name === 'title') {
    const title = environment.PR_TITLE ?? ''
    if (isConventionalTitle(title)) return { passed: true, message: `"${title}" names its type.` }
    return { passed: false, message: `"${title}"\n\n${titleRule}` }
  }
  if (name === 'issue-link') {
    const reason = noIssueReason(environment.PR_BODY ?? '')
    if (reason) return { passed: true, message: reason }
    for (let attempt = 1; attempt <= 3; attempt++) {
      const closes = closedIssues(environment.PR_NUMBER ?? '', environment.GITHUB_REPOSITORY ?? '')
      if (closes) return { passed: true, message: `Closes ${closes}` }
      if (attempt < 3) await wait(5000)
    }
    const stacked = otherBase(environment.PR_BASE, environment.DEFAULT_BRANCH)
    return { passed: false, message: stacked || issueRule }
  }
  if (name === 'fix-test') {
    const branch = environment.PR_BRANCH ?? ''
    const title = environment.PR_TITLE ?? ''
    if (!isFix(branch, title)) return { passed: true, message: 'Not a fix.' }
    const changed = changedFiles(environment.PR_NUMBER ?? '', environment.GITHUB_REPOSITORY ?? '')
    if (!fixWithoutTest(branch, title, changed)) return { passed: true, message: 'Changes a test.' }
    return { passed: false, message: `Changes no test:\n${changed.join('\n')}\n\n${fixRule}` }
  }
  return {
    passed: false,
    message: 'Run it as: node tools/checks/pull-request.mjs title, issue-link, or fix-test.'
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { passed, message } = await check(process.argv[2], process.env)
  console.log(message)
  process.exit(passed ? 0 : 1)
}
