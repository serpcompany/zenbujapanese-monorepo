import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const here = dirname(fileURLToPath(import.meta.url))
const workflowFile = join(here, '..', '..', '.github', 'workflows', 'code-review.yml')
const inlineComments = 'mcp__github_inline_comment__create_inline_comment'
const usage = `Try the Code review workflow's reviewer on a real pull request, with gh signed in:

  node tools/checks/review-dry-run.mjs context <pull request> <checkout of its head> <output folder>
  node tools/checks/review-dry-run.mjs verdict <output folder> <transcript> [last]

docs/agents/ci-review.md, Trying a change to the review, says what each writes.`

function gh(parameters, input) {
  const ran = spawnSync('gh', parameters, { input, encoding: 'utf8', maxBuffer: 2 ** 28 })
  if (ran.error) throw new Error(`gh didn't start: ${ran.error.message}`)
  return { status: ran.status, text: ran.stdout, problem: ran.stderr.trim() }
}

function answerOf(parameters, input) {
  const { status, text, problem } = gh(parameters, input)
  if (status !== 0) throw new Error(`gh ${parameters.join(' ')}: ${problem}`)
  return text
}

function forwardToGh(request, sent, response, kept) {
  const target = String(request.url).replace(/^\//, '')
  const answer = (status, text, more = {}) => {
    response.writeHead(status, { 'content-type': 'application/json', ...more })
    response.end(text)
  }
  if (request.method !== 'GET' && target !== 'graphql') {
    writeFileSync(kept, JSON.parse(sent).body)
    return answer(200, '{}')
  }
  if (/^repos\/[^/]+\/[^/]+\/pulls\/\d+$/.test(target)) return answer(200, '{"state":"open"}')
  const accepted = ['--header', `Accept: ${request.headers.accept}`]
  const asked =
    request.method === 'POST'
      ? gh(['api', '--include', target, ...accepted, '--input', '-'], sent)
      : gh(['api', '--include', target, ...accepted])
  const [head, ...rest] = asked.text.split(/\r?\n\r?\n/)
  const status = Number(/^HTTP\/\S+ (\d+)/.exec(head)?.[1] ?? 502)
  const next = /^link: (.*)$/im.exec(head)?.[1]
  const link = next
    ? { link: next.replaceAll('https://api.github.com', `http://${request.headers.host}`) }
    : {}
  answer(status, rest.join('\n\n'), link)
}

async function withGitHub(work, kept) {
  const server = createServer((request, response) => {
    let sent = ''
    request.on('data', chunk => {
      sent += chunk
    })
    request.on('end', () => forwardToGh(request, sent, response, kept))
  })
  await new Promise(listening => server.listen(0, '127.0.0.1', listening))
  try {
    return await work(`http://127.0.0.1:${server.address().port}`)
  } finally {
    server.close()
  }
}

const run = (script, environment) =>
  new Promise(done => {
    spawn(process.execPath, [script], { env: environment, stdio: 'inherit' }).on('close', done)
  })

const reviewJob = () => parse(readFileSync(workflowFile, 'utf8')).jobs.review

const pathsIn = out => ({
  state: join(out, 'dry-run.json'),
  context: join(out, 'review-context.md'),
  reviewersContext: join(out, 'review-reviewers-context.md'),
  change: join(out, 'review-change.json'),
  contextOutputs: join(out, 'context-outputs.txt'),
  outputs: join(out, 'verdict-outputs.txt'),
  stepSummary: join(out, 'step-summary.md'),
  log: join(out, 'attempt.json'),
  firstLog: join(out, 'first-attempt.json'),
  firstSummary: join(out, 'first-attempt-summary.md'),
  comment: join(out, 'summary-comment.md')
})

function claudeCommand(state, paths) {
  const reviewer = reviewJob().steps.find(step => step.id === 'review')
  const parameters = String(reviewer.with.claude_args)
    .replace(/\$\{\{[^}]*\}\}\/review-context\.md/, paths.context)
    .replace(/\$\{\{[^}]*\}\}\/review-reviewers-context\.md/, paths.reviewersContext)
    .replace(`${inlineComments},`, '')
  const settings = Object.entries(reviewer.env ?? {}).map(([name, value]) => `${name}=${value}`)
  return [
    `cd ${state.checkout} &&`,
    ...settings,
    `claude -p "/pr-review ${state.repository}/pull/${state.pullRequest}"`,
    '--setting-sources project --output-format stream-json --verbose',
    parameters,
    `> ${join(dirname(paths.context), 'attempt.jsonl')}`
  ].join(' ')
}

async function context(pullRequest, checkoutGiven, outGiven) {
  const checkout = resolve(checkoutGiven)
  const out = resolve(outGiven)
  const paths = pathsIn(out)
  mkdirSync(out, { recursive: true })
  const repository = answerOf(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
  const state = { repository: repository.trim(), pullRequest, checkout }
  const [base, openOrClosed, merged] = answerOf([
    'api',
    `repos/${state.repository}/pulls/${pullRequest}`,
    '--jq',
    '.base.ref, .state, .merged'
  ])
    .trim()
    .split('\n')
  const context = reviewJob().steps.find(step => step.id === 'earlier')
  writeFileSync(paths.contextOutputs, '')
  const status = await withGitHub(
    api =>
      run(join(here, 'review-context.mjs'), {
        ...process.env,
        GITHUB_API_URL: api,
        GITHUB_REPOSITORY: state.repository,
        GITHUB_TOKEN: 'gh-holds-the-token',
        GITHUB_WORKSPACE: checkout,
        GITHUB_OUTPUT: paths.contextOutputs,
        PR_NUMBER: String(pullRequest),
        BASE_REF: base,
        RULES: context.env.RULES,
        CHANGE_DIR: join(checkout, 'tmp', 'review-change'),
        CHANGE_FILE: paths.change,
        CONTEXT_FILE: paths.context,
        REVIEWERS_CONTEXT_FILE: paths.reviewersContext
      }),
    paths.comment
  )
  if (status !== 0) return status
  const changedFiles = /^changed_files=(\d+)$/m.exec(
    readFileSync(paths.contextOutputs, 'utf8')
  )?.[1]
  const startedAt = new Date().toISOString()
  writeFileSync(paths.state, JSON.stringify({ ...state, changedFiles, startedAt }))
  console.log(`\nThe reviewer's context is ${paths.context}. Run the reviewer with:\n`)
  console.log(claudeCommand(state, paths))
  if (openOrClosed !== 'open') {
    console.log(
      `\nPull request ${pullRequest} is ${merged === 'true' ? 'merged' : 'closed'}, and the skill reviews nothing on one that isn't open, so the reviewer may stop at once. verdict still measures a transcript as if the pull request were open.`
    )
  }
  return 0
}

function messagesOf(transcript, checkout) {
  const text = readFileSync(resolve(transcript), 'utf8').trim()
  const messages = text.startsWith('[')
    ? JSON.parse(text)
    : text
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line))
  const ranIn = messages.find(entry => entry?.type === 'system' && entry.subtype === 'init')?.cwd
  return ranIn && ranIn !== checkout
    ? JSON.parse(JSON.stringify(messages).replaceAll(ranIn, checkout))
    : messages
}

function summaryWrittenIn(messages, summaryFile) {
  return messages
    .flatMap(entry => (entry?.type === 'assistant' ? (entry.message?.content ?? []) : []))
    .filter(block => block?.type === 'tool_use' && block.input?.file_path === summaryFile)
    .at(-1)?.input?.content
}

async function verdict(outGiven, transcript, attempt) {
  const paths = pathsIn(resolve(outGiven))
  const state = JSON.parse(readFileSync(paths.state, 'utf8'))
  const changeFolder = join(state.checkout, 'tmp', 'review-change')
  const step = reviewJob().steps.find(
    each => each.id === (attempt === 'last' ? 'verdict' : 'first')
  )
  const script = join(dirname(paths.state), 'decide.cjs')
  writeFileSync(script, step.run)
  const summaryFile = join(state.checkout, 'tmp', 'review-summary.md')
  const messages = messagesOf(transcript, state.checkout)
  const written = summaryWrittenIn(messages, summaryFile)
  if (written !== undefined) writeFileSync(summaryFile, written)
  writeFileSync(paths.log, JSON.stringify(messages))
  writeFileSync(paths.outputs, '')
  writeFileSync(paths.stepSummary, '')
  const stale =
    attempt === 'last' ? [paths.comment] : [paths.comment, paths.firstLog, paths.firstSummary]
  for (const file of stale) rmSync(file, { force: true })
  const status = await withGitHub(
    api =>
      run(script, {
        ...process.env,
        STEP: step.env.STEP,
        GITHUB_API_URL: api,
        GITHUB_REPOSITORY: state.repository,
        GITHUB_TOKEN: 'gh-holds-the-token',
        GITHUB_OUTPUT: paths.outputs,
        GITHUB_STEP_SUMMARY: paths.stepSummary,
        GITHUB_WORKSPACE: state.checkout,
        PR_NUMBER: String(state.pullRequest),
        REVIEW_STARTED_AT: state.startedAt,
        CHANGED_FILES: state.changedFiles ?? '',
        CHANGE_FILE: paths.change,
        CHANGE_INDEX: join(changeFolder, 'index.md'),
        CORRECTION_FILE: paths.context,
        REVIEWERS_CONTEXT_FILE: paths.reviewersContext,
        EXECUTION_FILE: paths.log,
        FIRST_ATTEMPT_LOG: paths.firstLog,
        FIRST_ATTEMPT_SUMMARY: paths.firstSummary,
        SUMMARY_FILE: summaryFile,
        SUMMARY_ID: ''
      }),
    paths.comment
  )
  const outputs = readFileSync(paths.outputs, 'utf8')
  console.log(outputs.trim())
  if (existsSync(paths.comment)) {
    console.log(`\nThe summary comment it would post, and didn't, is ${paths.comment}.`)
  }
  if (status === 0 && /^retry=true$/m.test(outputs)) {
    console.log(
      `\nA second attempt is due. Its correction is at the end of ${paths.context}. Run the reviewer again with the same command, then: verdict ${dirname(paths.state)} <its transcript> last`
    )
  }
  return status
}

const [command, ...given] = process.argv.slice(2)
const ready =
  command === 'context' ? given.length === 3 : command === 'verdict' && given.length >= 2
if (!ready) {
  console.log(usage)
  process.exit(2)
}
try {
  process.exit(command === 'context' ? await context(...given) : await verdict(...given))
} catch (error) {
  console.error(String(error?.message ?? error))
  process.exit(1)
}
