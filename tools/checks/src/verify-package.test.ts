import { describe, expect, test } from 'vitest'
import { readRepositoryFile, readWorkflow, workflowFiles } from './agents/workflow'

const registry = 'https://npm.pkg.github.com'
const scope = '@serpcompany'
const jobToken = '${{ github.token }}'
const secretMount = 'RUN --mount=type=secret,id=npmrc,target=/root/.npmrc pnpm install '
const images = ['apps/account-api/Dockerfile', 'apps/dictionary-api/Dockerfile']

const installs = (run: string | undefined) => /\bpnpm install\b/.test(run ?? '')

const jobsThatInstall = workflowFiles().flatMap(path => {
  const workflow = readWorkflow(path)
  return Object.entries(workflow.jobs)
    .filter(([, job]) => (job.steps ?? []).some(step => installs(step.run)))
    .map(([name, job]) => ({
      path,
      name,
      steps: job.steps ?? [],
      permissions: job.permissions ?? workflow.permissions ?? {}
    }))
})

describe('@serpcompany/verify, a private package on GitHub Packages', () => {
  test('is a root devDependency at an exact version, which the lockfile pins', () => {
    const manifest = JSON.parse(readRepositoryFile('package.json'))
    expect(manifest.devDependencies['@serpcompany/verify']).toMatch(/^\d+\.\d+\.\d+$/)
    expect(manifest.scripts.verify).toBe('serp-verify')
    expect(readRepositoryFile('pnpm-lock.yaml')).toContain(
      `'@serpcompany/verify@${manifest.devDependencies['@serpcompany/verify']}':`
    )
  })

  test('comes from GitHub Packages, through a committed .npmrc that holds no token', () => {
    expect(readRepositoryFile('.npmrc')).toBe(`${scope}:registry=${registry}\n`)
  })

  test('is found in the jobs that install the workspace', () => {
    expect(jobsThatInstall.length).toBeGreaterThan(10)
    expect(jobsThatInstall.map(job => `${job.path} ${job.name}`)).toContain(
      '.github/workflows/repository.yml verify'
    )
  })

  test.each(
    jobsThatInstall.map(job => [`${job.path} ${job.name}`, job] as const)
  )("%s installs it with the job's own token, which may read packages", (_, job) => {
    expect(['read', 'write']).toContain(job.permissions.packages)
    const setUp = job.steps.find(step => step.uses?.startsWith('actions/setup-node@'))
    expect(setUp?.with).toMatchObject({ 'registry-url': registry, scope })
    for (const step of job.steps.filter(each => installs(each.run))) {
      expect(step.env?.NODE_AUTH_TOKEN, step.run).toBe(jobToken)
    }
  })

  test.each(images)('%s installs it with a secret npmrc, which no layer keeps', path => {
    const text = readRepositoryFile(path)
    expect(text).toContain(secretMount)
    expect(text).not.toMatch(/^RUN pnpm install /m)
    expect(text).not.toMatch(/^COPY .*\.npmrc/m)
  })

  test.each(images)('the workflow that builds %s hands its build that npmrc', path => {
    const builds = workflowFiles().flatMap(file =>
      Object.values(readWorkflow(file).jobs).flatMap(job =>
        (job.steps ?? []).filter(step => step.with?.file === path)
      )
    )
    expect(builds.length).toBeGreaterThan(0)
    for (const build of builds) {
      expect(build.with?.['secret-files']).toBe('npmrc=${{ runner.temp }}/npmrc')
    }
  })
})
