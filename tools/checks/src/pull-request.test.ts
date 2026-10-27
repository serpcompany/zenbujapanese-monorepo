import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import {
  branchProblem,
  branchRule,
  closingReferences,
  isConventionalTitle,
  issueRule,
  noIssueReason,
  otherBase,
  patiently,
  titleRule
} from '../pull-request.mjs'
import { root } from './files'

test.each([
  'fix: Escape closes the Settings window',
  'feat(web): the kana charts open each kana',
  'chore!: drop Node 20',
  'perf: linked sentences are as fast as the Swift was'
])('takes %s as a Conventional Commit title', title => {
  expect(isConventionalTitle(title)).toBe(true)
})

test.each([
  'Cover Tomodachi itself in the Privacy Policy and on Support',
  'Website: the kana charts',
  'fix:no space',
  'fix: ',
  'Fix: capitalised',
  'bugfix: an unknown type'
])("doesn't take %s", title => {
  expect(isConventionalTitle(title)).toBe(false)
})

const lastFiftyMerged: [branch: string, type: string][] = [
  ['fix/account-input-rules', 'fix:'],
  ['fix/1015-close-prerender-streams', 'fix:'],
  ['fix/romaji-search-matches-shown', 'fix:'],
  ['test/1011-sentence-results-screen', 'test:'],
  ['refactor/830-sentence-analysis-in-core', 'refactor:'],
  ['fix/912-account-audit-largest', 'fix(ios):'],
  ['fix/557-scheduled-gardening-runs', 'fix(ci):'],
  ['test/mac-ui-paste-japanese', 'test(ios):'],
  ['fix/app-tests-under-load-2', 'fix:'],
  ['ci/jmdict-monthly-update', 'ci:'],
  ['feat/412-meaning-linked-examples', 'feat:'],
  ['feat/825-compound-pitch-rule', 'feat(language-data):'],
  ['perf/dictionary-service-shared-cache', 'perf(dictionary-api):'],
  ['perf/core-rank-comparator', 'perf(core):'],
  ['fix/website-gate-under-load', 'fix(web):'],
  ['fix/simulator-keeper-boot-and-prefs', 'fix:'],
  ['fix/note-tests-under-load', 'fix(ios):'],
  ['fix/ios-transport-errors-and-mac-sheet-rows', 'fix(ios):'],
  ['fix/929-pitch-from-own-lemma', 'fix(language-data):'],
  ['ci/799-review-action-pin', 'ci:'],
  ['fix/ios-crash-reports-tests-and-picked-kanji', 'fix(ios):'],
  ['feat/website-privacy-and-furigana', 'feat(web):'],
  ['build/verify-0.1.1', 'build:'],
  ['build/shared-checks-and-test-fixes', 'build:'],
  ['fix/reveal-scrolls-both-ways', 'fix:'],
  ['build/931-iphone-only-2.0.1', 'build:'],
  ['fix/921-913-whole-glosses', 'fix(ios):'],
  ['feat/sync-and-subscription-app', 'feat(ios):'],
  ['feat/860-report-a-problem', 'feat:'],
  ['fix/868-subscribe-after-back', 'fix(web):'],
  ['feat/sync-and-subscription-web', 'feat(web):'],
  ['feat/917-package-license-notices', 'feat:'],
  ['feat/sync-and-subscription-service', 'feat:'],
  ['feat/900-speak-meaning', 'feat:'],
  ['fix/908-search-leftover-copy', 'fix:'],
  ['fix/909-rename-list-uitest', 'fix:'],
  ['feat/859-crash-reports', 'feat(ios):'],
  ['feat/899-look-up', 'feat:'],
  ['feat/902-footer-socials', 'feat:'],
  ['feat/904-privacy-app-reports', 'feat:'],
  ['chore/build-8-of-2.0.1', 'chore:'],
  ['fix/ios27-menu-choices-by-label', 'fix:'],
  ['feat/394-share-sheet-card', 'feat:'],
  ['chore/build-7-of-2.0.1', 'chore:'],
  ['feat/394-siri-pronunciation-hint', 'feat:'],
  ['chore/build-6-of-2.0.1', 'chore:'],
  ['feat/888-word-page-romaji-titles', 'feat:'],
  ['feat/886-search-phrases-in-titles', 'feat:'],
  ['feat/847-languages-in-the-footer', 'feat:'],
  ['feat/829-app-store-banner', 'feat:']
]

test.each(lastFiftyMerged)('takes %s, one of the last 50 merged, titled %s', (branch, type) => {
  expect(branchProblem(branch, `${type} the outcome`)).toBe('')
})

test.each([
  [
    'feat/jmdict-2026-11-01',
    "feat(language-data): the dictionary moves to JMdict's 2026-11-01 export"
  ],
  ['docs/gardening-2026-10-26', 'Weekly doc gardening (2026-10-26)'],
  ['chore/code-gardening-2026-10-26', 'Split the website guide by task (#516)']
])('takes %s, a branch a workflow names, whatever its title', (branch, title) => {
  expect(branchProblem(branch, title)).toBe('')
})

test.each([
  ['feature/417-watch-and-listen', 'a type the titles have no word for'],
  ['experiment/migaku-parsing-comparison', 'no type at all'],
  ['claude/issue-12-20261025', "Claude's own name for a branch"],
  ['Fix/701-english-default-sort', 'capitals'],
  ['fix/701_english_default_sort', 'underscores'],
  ['fix/701-english-', 'a slug ending in a hyphen'],
  ['fix/web/701-english', 'a second slash'],
  ['fix/', 'no slug']
])('refuses %s, with %s', branch => {
  expect(branchProblem(branch, 'fix: the outcome')).toBe(
    `${branch} isn't <type>/<issue>-<slug> or <type>/<slug>.`
  )
})

test("refuses a branch whose type is not the title's, and says what each says", () => {
  expect(
    branchProblem('feat/481-shared-core', 'refactor(core): the app runs the shared core')
  ).toBe("feat/481-shared-core is a feat branch, and the title's type is refactor.")
  expect(branchRule).toContain('<type>/<issue>-<slug>')
})

test('reads the reason from a line that says there is no issue', () => {
  expect(noIssueReason('No issue: a typo in a workflow name\n\n## Why')).toBe(
    'No issue: a typo in a workflow name'
  )
  expect(noIssueReason('## Why\nno issue: found while reviewing')).toBe(
    'no issue: found while reviewing'
  )
  expect(noIssueReason('No issue:\n')).toBeUndefined()
  expect(noIssueReason('There is no issue: see below')).toBeUndefined()
  expect(noIssueReason('Part of #12')).toBeUndefined()
})

const run = (check: string, env: Record<string, string>) =>
  spawnSync(process.execPath, [join(root, 'tools', 'checks', 'pull-request.mjs'), check], {
    env: { PATH: process.env.PATH ?? '', ...env },
    encoding: 'utf8'
  })

test('the title check passes a typed title and explains a plain one', () => {
  expect(run('title', { PR_TITLE: 'docs: the stage and commands are in AGENTS.md' }).status).toBe(0)
  const plain = run('title', { PR_TITLE: 'Say the stage in AGENTS.md; $(rm -rf .)' })
  expect(plain.status).toBe(1)
  expect(plain.stdout).toContain('"Say the stage in AGENTS.md; $(rm -rf .)"')
  expect(plain.stdout).toContain(titleRule)
})

test('the branch check passes a branch named for its title and explains one that is not', () => {
  const named = run('branch', {
    PR_BRANCH: 'ci/381-pinned-actions',
    PR_TITLE: 'ci: every action is pinned'
  })
  expect(named.status).toBe(0)
  expect(named.stdout).toContain('ci/381-pinned-actions names its type and work.')
  const unnamed = run('branch', {
    PR_BRANCH: 'pinned-actions',
    PR_TITLE: 'ci: every action is pinned'
  })
  expect(unnamed.status).toBe(1)
  expect(unnamed.stdout).toContain(branchRule)
})

test('the issue-link check takes a stated reason without asking GitHub', () => {
  const exempt = run('issue-link', { PR_BODY: 'No issue: a doc fix found on the way' })
  expect(exempt.status).toBe(0)
  expect(exempt.stdout).toContain('No issue: a doc fix found on the way')
  expect(issueRule).toContain('Closes #<number>')
})

test('a pull request stacked on another branch is told why GitHub links no issue to it yet', () => {
  expect(otherBase('feat/701-parent', 'main')).toContain('based on feat/701-parent, not main')
  expect(otherBase('feat/701-parent', 'main')).toContain(
    'With Closes #<number> in its body, the check passes once it is retargeted'
  )
  expect(otherBase('main', 'main')).toBe('')
  expect(otherBase(undefined, 'main')).toBe('')
  expect(otherBase('main', undefined)).toBe('')
})

const ownRepository = 'serpcompany/zenbujapanese-monorepo'

test('reads the issues a description closes from its closing keywords', () => {
  expect(
    closingReferences(
      'Closes #542\nfixes: #12, Resolved serpcompany/other#7 and closes https://github.com/a/b/issues/9.\nFixes\t#22',
      ownRepository
    )
  ).toEqual([
    { repository: '', number: 542 },
    { repository: '', number: 12 },
    { repository: 'serpcompany/other', number: 7 },
    { repository: 'a/b', number: 9 },
    { repository: '', number: 22 }
  ])
  expect(closingReferences(undefined)).toEqual([])
})

test("names one of this repository's issues once, however it is written", () => {
  expect(
    closingReferences(
      'Closes #18, closes SerpCompany/Zenbujapanese-Monorepo#18, and CLOSES https://github.com/serpcompany/zenbujapanese-monorepo/issues/18',
      ownRepository
    )
  ).toEqual([{ repository: '', number: 18 }])
})

test.each([
  ['in inline code', 'Write `Closes #13` in the body.'],
  ['in a fenced block', 'Before\n```md\nCloses #14\n```\nafter'],
  ['in a block fenced with tildes', '~~~\nFixes #19\n~~~'],
  ['in code between double backticks', 'Write ``Closes #13`` or `` a ` Closes #13 `` there.'],
  ['in inline code that runs over lines', 'see `the body\nCloses #13\nand more` there'],
  ['in a fence indented under a list item', '- an item\n\n  ```md\n  Closes #14\n  ```\n'],
  ['in a fence closed by a longer one', '```\nCloses #14\n`````\nafter'],
  ['in a fence that holds a shorter one', '````\n```\nCloses #14\n```\n````'],
  ['in a fence that is never closed', 'Before\n```\nCloses #14\nto the end'],
  ['too large to be an issue', 'Closes #99999999999'],
  ['in an HTML comment', ['<!', '-- Closes #20 --', '>'].join('')],
  ['on a later line than its keyword', 'the fix\n\n#16'],
  ['after a word that only ends like a keyword', 'a bug-fix #17, a hotfix #21, a prefix #6'],
  ['after a word that closes nothing', 'Part of #3, refs #4, encloses #5']
])('reads no issue from a number %s, where GitHub links nothing', (_, body) => {
  expect(closingReferences(body, ownRepository)).toEqual([])
})

test.each([
  ['after a fence that was closed', '```\ncode\n```\nCloses #5'],
  ['after a blank line, which ends inline code', 'a stray ` here\n\nCloses #5, and ` there'],
  ['after a line that only starts with inline code', '```code``` is inline\n\nCloses #5'],
  ['in an indented code block, which it does not tell from a list item', 'Text\n\n    Closes #5']
])('still reads an issue %s', (_, body) => {
  expect(closingReferences(body, ownRepository)).toEqual([{ repository: '', number: 5 }])
})

test('asks again, after a pause, until there is an answer or the attempts run out', async () => {
  const answers = ['', '', '#12']
  const asked: string[] = []
  const read = () => {
    asked.push('asked')
    return answers[asked.length - 1]
  }
  const waited: number[] = []
  const wait = async (milliseconds: number) => {
    waited.push(milliseconds)
  }
  expect(await patiently(read, { wait })).toBe('#12')
  expect(asked).toHaveLength(3)
  expect(waited).toEqual([5000, 5000])
  expect(await patiently(() => '', { attempts: 2, pause: 1, wait })).toBe('')
  expect(await patiently(() => '#7', { wait })).toBe('#7')
  expect(waited).toEqual([5000, 5000, 1])
})
