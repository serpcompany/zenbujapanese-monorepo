import { claudeResult } from './guards'

type Input = Record<string, unknown>

export const runnerWorkspace = '/home/runner/work/zenbujapanese-monorepo/zenbujapanese-monorepo'
export const changeFolder = `${runnerWorkspace}/tmp/review-change`
const inlineComment = 'mcp__github_inline_comment__create_inline_comment'

export const called = (id: string, name: string, input: Input = {}) => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id, name, input }] }
})

export const answered = (id: string, failed = false) => ({
  type: 'user',
  message: {
    content: [{ type: 'tool_result', tool_use_id: id, ...(failed ? { is_error: true } : {}) }]
  }
})

const ran = (id: string, name: string, input: Input = {}) => [called(id, name, input), answered(id)]
const refused = (id: string, name: string, input: Input = {}) => [
  called(id, name, input),
  answered(id, true)
]
const summaryFile = `${runnerWorkspace}/tmp/review-summary.md`
const result = claudeResult({ modelUsage: { 'claude-sonnet-5-5': {} } })

export interface ReviewCase {
  pullRequest: number
  run: string
  changedFiles: number
  summary: string
  log: unknown[]
}

const filesOf761 = [
  'AGENTS.md',
  'ARCHITECTURE.md',
  'deploy/deployer.sh',
  'docs/agents/api-servers.md',
  'docs/agents/ci-deploys.md',
  'docs/agents/ci.md',
  'docs/agents/deployer-alerts.md',
  'docs/agents/dictionary-api.md',
  'docs/agents/verification.md',
  'docs/harness-debt.md',
  'docs/quality.md',
  'docs/technologies.md',
  'tools/checks/src/dependencies.ts',
  'tools/checks/src/deployer/alerts.test.ts',
  'tools/checks/src/deployer/deploys.test.ts',
  'tools/checks/src/deployer/docker.ts',
  'tools/checks/src/deployer/refusals.test.ts',
  'tools/checks/src/deployer/server.ts',
  'tools/checks/src/deployer/stand-ins.ts'
]

export const changeOf761 = filesOf761.map((path, position) => ({
  path,
  patch: `${changeFolder}/${String(position + 1).padStart(4, '0')}.patch`,
  file: `${runnerWorkspace}/${path}`
}))

const summaryOf761 = `## Claude review
Reviewed c58455e, round 1.
Read 2 of 19 changed files.
Not read: the test files and stand-ins under \`tools/checks/src/deployer/\`, \`tools/checks/src/dependencies.ts\`, and the edits to \`AGENTS.md\`, \`ARCHITECTURE.md\`, \`docs/agents/api-servers.md\`, \`ci-deploys.md\`, \`ci.md\`, \`dictionary-api.md\`, \`verification.md\`, \`harness-debt.md\`, \`quality.md\` and \`technologies.md\`. I did not run the three parallel reviewers the review skill asks for. I read \`deploy/deployer.sh\` in full and the new \`docs/agents/deployer-alerts.md\`.
No new findings in what I read. Alert sending, the once-per-failure memory, the unset-webhook default and the exit trap behave as the doc describes.
Closes #542: not checked against the issue's acceptance criteria, because I did not read the issue.
`

const savedDiffOf761 =
  'gh pr diff 761 --repo serpcompany/zenbujapanese-monorepo > /tmp/pr.diff; grep -n "^diff" /tmp/pr.diff'

export const pullRequest761: ReviewCase = {
  pullRequest: 761,
  run: '38367523368',
  changedFiles: 19,
  summary: summaryOf761,
  log: [
    { type: 'system', subtype: 'init' },
    ...ran('toolu_view', 'Bash', {
      command:
        'gh pr view 761 --repo serpcompany/zenbujapanese-monorepo --json state,isDraft,title,body,headRefOid,baseRefName,closingIssuesReferences,changedFiles; gh pr diff 761 --repo serpcompany/zenbujapanese-monorepo --name-only'
    }),
    ...ran('toolu_deployer', 'Read', { file_path: `${runnerWorkspace}/deploy/deployer.sh` }),
    ...refused('toolu_saved_diff', 'Bash', { command: savedDiffOf761 }),
    ...ran('toolu_diff', 'Bash', {
      command: 'gh pr diff 761 --repo serpcompany/zenbujapanese-monorepo'
    }),
    ...refused('toolu_awk', 'Bash', {
      command: "awk '/^diff --git a\\/deploy\\/deployer.sh/{p=1} p' tool-results/bgrg0e9ht.txt"
    }),
    ...ran('toolu_alerts', 'Read', {
      file_path: `${runnerWorkspace}/docs/agents/deployer-alerts.md`
    }),
    ...ran('toolu_summary', 'Write', { file_path: summaryFile, content: summaryOf761 }),
    result({
      num_turns: 10,
      duration_ms: 36_021,
      total_cost_usd: 0.295673,
      permission_denials: [{ tool_name: 'Bash', tool_input: { command: savedDiffOf761 } }],
      result:
        'This is only a partial review of PR 761: I read `deploy/deployer.sh` and `docs/agents/deployer-alerts.md` and found no problems in either. I read 2 of the 19 changed files.'
    })
  ]
}

const summaryOf757 = `## Claude review
Reviewed 95d2443, round 1.
Read 9 of 9 changed files.
0 blocking and 1 suggestion, commented inline.
No issue is closed (\`No issue:\` stated in the body).
`

const findingOf757 = {
  path: 'apps/ios/docs/product/translate.md',
  line: 157,
  confirmed: true,
  body: "**suggestion** The user-visible change isn't described in the product doc\n\nThe PR body names one visible difference: after a pause made mid-sentence, one blank row's height of extra space stays at the bottom."
}

export const pullRequest757: ReviewCase = {
  pullRequest: 757,
  run: '38334798328',
  changedFiles: 9,
  summary: summaryOf757,
  log: [
    { type: 'system', subtype: 'init' },
    ...ran('toolu_view', 'Bash', {
      command:
        'gh pr view 757 --repo serpcompany/zenbujapanese-monorepo --json state,isDraft,title,body,headRefOid,baseRefName,closingIssuesReferences,changedFiles'
    }),
    ...ran('toolu_diff', 'Bash', {
      command:
        "gh pr diff 757 --repo serpcompany/zenbujapanese-monorepo | grep -v '^index' | head -700"
    }),
    ...ran('toolu_finding', inlineComment, findingOf757),
    ...ran('toolu_summary', 'Write', { file_path: summaryFile, content: summaryOf757 }),
    result({ num_turns: 8, duration_ms: 24_099, total_cost_usd: 0.2551242 })
  ]
}

const summaryOf759 = `## Claude review
Reviewed 1f39496, round 1.
Read 41 of 71 changed files.
Not read: generated or recorded files (the example word index database, the bundled \`dictionary-core.js\`, the conformance JSON, the Tatoeba import record); most test files and the Swift test and UI test files; the docs \`ios.md\`, \`web.md\`, \`dictionary-api.md\`, \`dictionary-core.md\`, \`data-sources.md\` and the quality files were only skimmed.
No new findings.
Closes #401: every acceptance criterion is met, except that \`bathroom\` lists 風呂, not the 浴室 the issue names. The pull request states this under "Left out", and an owner accepted it.
`

const reviewerOf759 = (id: string, description: string) =>
  ran(id, 'Agent', { description, subagent_type: 'general-purpose' })

export const pullRequest759: ReviewCase = {
  pullRequest: 759,
  run: '38358572839',
  changedFiles: 71,
  summary: summaryOf759,
  log: [
    { type: 'system', subtype: 'init' },
    ...reviewerOf759('toolu_bugs', 'Review bugs'),
    ...reviewerOf759('toolu_rules', 'Review rules'),
    ...reviewerOf759('toolu_issue', 'Review issue tests docs'),
    ...ran('toolu_summary', 'Write', { file_path: summaryFile, content: summaryOf759 }),
    result({ num_turns: 7, duration_ms: 148_395, total_cost_usd: 1.5682815 })
  ]
}
