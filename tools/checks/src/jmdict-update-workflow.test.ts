import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { outsideGit, scratchFolder } from './agents/scratch'
import { readRepositoryFile } from './agents/workflow'
import {
  recordsItsCall,
  repository,
  runStep,
  stepNamed,
  steps,
  workflow
} from './jmdict-update-world'

const job = workflow.jobs.update
const skip = stepNamed('Skip while an earlier JMdict update is open')
const push = stepNamed('Commit, push the Git LFS files and the branch, and open the pull request')
const names = steps.map(step => step.name ?? step.uses ?? '')
const at = (name: string) => names.findIndex(each => each === name || each.startsWith(`${name}@`))
const pinnedPython = /^PINNED_PYTHON = \((\d+), (\d+), (\d+)\)$/m.exec(
  readRepositoryFile('language-data/tools/rebuild_language_data.py')
)

describe('the JMdict monthly update workflow', () => {
  test("runs once a month, after EDRDG writes that day's export, and by hand, one run at a time", () => {
    expect(workflow.on.schedule).toEqual([{ cron: '0 6 1 * *' }])
    expect(workflow.on).toHaveProperty('workflow_dispatch')
    expect(Object.keys(workflow.on)).toEqual(['schedule', 'workflow_dispatch'])
    expect(workflow.concurrency).toEqual({ group: 'jmdict-update', 'cancel-in-progress': false })
  })

  test('rebuilds on a Mac, on the Python the data tools pin, as a workstation does', () => {
    expect(Object.keys(workflow.jobs)).toEqual(['update'])
    expect((job as { 'runs-on'?: string })['runs-on']).toBe('macos-26')
    expect(pinnedPython).not.toBeNull()
    expect(job.env?.UV_PYTHON).toBe(pinnedPython?.slice(1).join('.'))
    const uvRuns = steps.flatMap(step => (step.run ?? '').match(/uv run[^\n]*/g) ?? [])
    expect(uvRuns.length).toBeGreaterThan(4)
    for (const run of uvRuns) expect(run).toMatch(/^uv run --no-project python language-data\//)
  })

  test('may push a branch and open a pull request, and read the packages, and nothing more', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(job.permissions).toEqual({
      contents: 'write',
      'pull-requests': 'write',
      packages: 'read'
    })
  })

  test('keeps its token out of the checkout, the install, and every step that runs the data tools', () => {
    const checkout = steps.find(step => step.uses?.startsWith('actions/checkout@'))
    expect(checkout?.with).toMatchObject({ 'fetch-depth': 0, 'persist-credentials': false })
    expect(stepNamed('Install every package, running no install script').run).toBe(
      'pnpm install --frozen-lockfile --ignore-scripts'
    )
    const holding = steps.filter(step => step.env?.GH_TOKEN).map(step => step.name)
    expect(holding).toEqual([
      'Skip while an earlier JMdict update is open',
      'Fetch the Git LFS files the rebuild reads',
      'Commit, push the Git LFS files and the branch, and open the pull request'
    ])
    expect(job.env).not.toHaveProperty('GH_TOKEN')
  })

  test('downloads first, and changes nothing unless the export is newer than the pin', () => {
    const order = [
      'Skip while an earlier JMdict update is open',
      'actions/checkout',
      'astral-sh/setup-uv',
      "Download today's JMdict from EDRDG and compare it with the pinned export",
      'Install every package, running no install script',
      'Fetch the Git LFS files the rebuild reads',
      'Move the source record and its snapshot to the new export',
      "Rebuild what JMdict feeds, keeping every entry's note identity",
      'Record again the suites a runner can record',
      'Start the next release and record the entries it retires',
      "Export the core's fixtures from the rebuilt files",
      'Write the pull request',
      'Commit, push the Git LFS files and the branch, and open the pull request'
    ].map(at)
    expect(order.every(index => index > -1)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    const download = at("Download today's JMdict from EDRDG and compare it with the pinned export")
    for (const step of steps.slice(1, download + 1)) expect(step.if).toBe("env.CHECK == 'true'")
    for (const step of steps.slice(download + 1)) expect(step.if).toBe("env.UPDATE == 'true'")
  })

  test('records the tokenizer suite, the one a runner can record, and retires entries with retire', () => {
    expect(stepNamed('Record again the suites a runner can record').run).toBe(
      'pnpm --filter zenbujapanese-dictionary-api tokenizer-suite'
    )
    expect(stepNamed('Start the next release and record the entries it retires').run).toContain(
      'python language-data/pipeline/package.py retire --previous-database "$WORK/PreviousLanguageReferenceData.sqlite3"'
    )
    expect(stepNamed("Export the core's fixtures from the rebuilt files").run).toBe(
      'pnpm --filter zenbujapanese-dictionary-api fixtures'
    )
  })

  test('fetches the Git LFS files the rebuild reads, but not the snapshot it replaces', () => {
    expect(job.env?.LFS_FILES).toBe(
      'apps/ios/Modules/Sources/SearchExperience/Resources/**,language-data/sources/**'
    )
    expect(job.env?.LFS_REPLACED).toBe('language-data/sources/JMdict_e_examp-*.gz')
    expect(readRepositoryFile('.gitattributes')).toContain(
      'language-data/sources/JMdict_e_examp-*.gz filter=lfs'
    )
    expect(stepNamed('Fetch the Git LFS files the rebuild reads').run).toContain(
      'git lfs install --local'
    )
  })
})

describe('its first step', () => {
  async function skipped(open: string) {
    const folder = scratchFolder('jmdict-skip')
    const log = join(folder, 'gh.log')
    const run = await runStep(skip, {
      cwd: folder,
      env: { GH_TOKEN: 'test-token' },
      standIns: { gh: recordsItsCall(log, 0, open) }
    })
    return { ...run, asked: readFileSync(log, 'utf8') }
  }

  test("asks GitHub for main's open pull requests, and checks on when none is a JMdict update", async () => {
    const { status, githubEnv, asked } = await skipped('')
    expect(status).toBe(0)
    expect(githubEnv).toBe('CHECK=true\n')
    expect(asked).toContain(`pr list --repo ${repository} --base main --state open`)
    expect(asked).toContain('startswith("feat/jmdict-")')
  })

  test('warns and stops while the last update is open, since a second would only conflict', async () => {
    const { status, githubEnv, output } = await skipped('41')
    expect(status).toBe(0)
    expect(githubEnv).toBe('')
    expect(output).toContain(
      "::warning title=JMdict wasn't updated::The last JMdict update, #41, is still open."
    )
  })
})

describe('its last step, on a scratch checkout with Git LFS and a bare remote', () => {
  const branch = 'feat/jmdict-2026-11-01'
  const snapshot = 'language-data/sources/JMdict_e_examp-2026-11-01.gz'
  const title =
    "feat(language-data): the dictionary moves to JMdict's 2026-11-01 export, in release 2026.11.1"

  function world(filters: boolean) {
    const folder = scratchFolder('jmdict-push')
    const remote = join(folder, 'remote.git')
    const checkout = join(folder, 'checkout')
    const work = join(folder, 'work')
    const config = join(folder, 'gitconfig')
    writeFileSync(config, '')
    const env = { ...outsideGit(), GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1' }
    const git = (cwd: string, ...args: string[]) => {
      const result = spawnSync(
        'git',
        ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
        {
          cwd,
          env,
          encoding: 'utf8'
        }
      )
      expect(result.status, result.stderr).toBe(0)
      return result.stdout.trim()
    }
    git(folder, 'init', '--quiet', '--bare', remote)
    git(folder, 'init', '--quiet', '--initial-branch=main', checkout)
    if (filters) git(checkout, 'lfs', 'install', '--local')
    writeFileSync(
      join(checkout, '.gitattributes'),
      'language-data/sources/JMdict_e_examp-*.gz filter=lfs diff=lfs merge=lfs -text\n'
    )
    mkdirSync(join(checkout, 'language-data/sources'), { recursive: true })
    writeFileSync(join(checkout, 'language-data/release.json'), '{\n  "release": "2026.10.6"\n}\n')
    git(checkout, 'add', '.')
    git(checkout, 'commit', '--quiet', '-m', 'main')
    git(checkout, 'remote', 'add', 'origin', remote)
    git(checkout, 'push', '--quiet', 'origin', 'main')
    writeFileSync(join(checkout, snapshot), Buffer.alloc(4096, 7))
    writeFileSync(join(checkout, 'language-data/release.json'), '{\n  "release": "2026.11.1"\n}\n')
    mkdirSync(work)
    writeFileSync(join(work, 'title.txt'), `${title}\n`)
    writeFileSync(join(work, 'body.md'), 'No issue: the monthly update.\n')
    return { folder, remote, checkout, work, env, git }
  }

  async function pushed(filters: boolean, prCreates = 0) {
    const made = world(filters)
    const log = join(made.folder, 'gh.log')
    const run = await runStep(push, {
      cwd: made.checkout,
      env: {
        ...made.env,
        BRANCH: branch,
        EXPORT_DATE: '2026-11-01',
        WORK: made.work,
        GH_TOKEN: 'test-token'
      },
      standIns: { gh: recordsItsCall(log, prCreates) }
    })
    return { ...run, ...made, asked: existsSync(log) ? readFileSync(log, 'utf8') : '' }
  }

  test('commits the snapshot as a Git LFS pointer, pushes its object and the branch, and opens the pull request', async () => {
    const { status, output, remote, git, asked, work } = await pushed(true)
    expect(status, output).toBe(0)
    const pointer = git(remote, 'cat-file', 'blob', `${branch}:${snapshot}`)
    expect(pointer).toMatch(
      /^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:([0-9a-f]{64})\nsize 4096$/
    )
    const oid = /oid sha256:([0-9a-f]{64})/.exec(pointer)?.[1] ?? ''
    expect(existsSync(join(remote, 'lfs/objects', oid.slice(0, 2), oid.slice(2, 4), oid))).toBe(
      true
    )
    expect(git(remote, 'log', '--format=%an <%ae>%n%s', '-1', branch)).toBe(
      `github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>\n${title}`
    )
    expect(git(remote, 'show', `${branch}:language-data/release.json`)).toContain('2026.11.1')
    expect(asked.trim()).toBe(
      `pr create --repo ${repository} --base main --head ${branch} --title ${title} --body-file ${work}/body.md`
    )
  })

  test('pushes nothing when a file Git LFS tracks would be committed whole', async () => {
    const { status, output, remote, asked } = await pushed(false)
    expect(status).toBe(1)
    expect(output).toContain(
      `::error title=JMdict wasn't updated::${snapshot} is committed whole, not as a Git LFS pointer, so nothing was pushed.`
    )
    const branches = spawnSync('git', ['branch', '--list'], {
      cwd: remote,
      encoding: 'utf8'
    }).stdout
    expect(branches).not.toContain(branch)
    expect(asked).toBe('')
  })

  test('says how to finish by hand when GitHub refuses the pull request, its branch pushed', async () => {
    const { status, output, git, remote } = await pushed(true, 1)
    expect(status).toBe(1)
    expect(output).toContain(
      `::error title=The JMdict pull request didn't open::${branch} is pushed with its Git LFS files.`
    )
    expect(output).toContain('Settings, Actions, General, Workflow permissions')
    expect(git(remote, 'rev-parse', '--verify', '--quiet', branch)).toMatch(/^[0-9a-f]{40}$/)
  })
})
