import { spawnSync } from 'node:child_process'
import { classify, root } from './files'

export interface LinterResult {
  name: string
  status: 'passed' | 'failed' | 'not available'
  ranIn: 'installed' | 'docker' | null
  output: string
}

interface Linter {
  name: string
  command: string
  image: string
  args: (files: readonly string[]) => string[] | null
}

const linterVersions = {
  shellcheck: '0.11.0',
  actionlint: '1.7.12',
  ruff: '0.13.0'
} as const

const shellFiles = (files: readonly string[]) =>
  files.filter(path => {
    const kind = classify(path)
    return kind.kind === 'code' && kind.language === 'shell'
  })

const linters: readonly Linter[] = [
  {
    name: 'ShellCheck',
    command: 'shellcheck',
    image: `koalaman/shellcheck:v${linterVersions.shellcheck}`,
    args: files => {
      const scripts = shellFiles(files)
      return scripts.length ? ['--external-sources', ...scripts] : null
    }
  },
  {
    name: 'actionlint',
    command: 'actionlint',
    image: `rhysd/actionlint:${linterVersions.actionlint}`,
    args: files => {
      const workflows = files.filter(path => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path))
      return workflows.length ? workflows : null
    }
  },
  {
    name: 'Ruff',
    command: 'ruff',
    image: `ghcr.io/astral-sh/ruff:${linterVersions.ruff}`,
    args: files => {
      const python = files.filter(path => {
        const kind = classify(path)
        return kind.kind === 'code'
          ? kind.language === 'python'
          : kind.kind === 'pinned-bytes' && path.endsWith('.py')
      })
      return python.length ? ['check', '--quiet', '--force-exclude', ...python] : null
    }
  }
]

interface Run {
  status: number | null
  output: string
  missing: boolean
}

function run(command: string, args: readonly string[]): Run {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
    missing: (result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
  }
}

const dockerUnavailableStatus = 125

function runInDocker(linter: Linter, args: readonly string[]): Run {
  const mount = `type=bind,source=${root},target=/repository`
  const result = run('docker', [
    'run',
    '--rm',
    '--mount',
    mount,
    '--workdir',
    '/repository',
    linter.image,
    ...args
  ])
  const unavailable =
    result.missing ||
    result.status === dockerUnavailableStatus ||
    /Cannot connect to the Docker daemon|error during connect/i.test(result.output)
  return { ...result, missing: unavailable }
}

export function runLinters(files: readonly string[]): LinterResult[] {
  return linters.flatMap((linter): LinterResult[] => {
    const args = linter.args(files)
    if (args === null) return []
    let ranIn: LinterResult['ranIn'] = 'docker'
    let result = runInDocker(linter, args)
    if (result.missing) {
      ranIn = 'installed'
      result = run(linter.command, args)
    }
    if (result.missing) {
      return [{ name: linter.name, status: 'not available', ranIn: null, output: linter.image }]
    }
    const status = result.status === 0 ? 'passed' : 'failed'
    return [{ name: linter.name, status, ranIn, output: result.output }]
  })
}
