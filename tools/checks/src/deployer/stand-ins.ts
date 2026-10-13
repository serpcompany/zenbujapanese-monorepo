import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { createServer, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterAll } from 'vitest'

export interface Answer {
  status?: number
  stdout?: string
  stderr?: string
}

export type StandIn = (args: string[]) => Answer | undefined | Promise<Answer | undefined>

interface Call {
  tool: string
  args: string[]
}

const minimumBash = [4, 4]
const usualFolders = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin']

function isNewEnough(candidate: string): boolean {
  const version = spawnSync(candidate, ['--version'], { encoding: 'utf8' }).stdout ?? ''
  const [major, minor] = (/version (\d+)\.(\d+)/.exec(version) ?? []).slice(1).map(Number)
  return major > minimumBash[0] || (major === minimumBash[0] && minor >= minimumBash[1])
}

function findBash(): string | undefined {
  const folders = [...(process.env.PATH ?? '').split(delimiter).filter(Boolean), ...usualFolders]
  return folders
    .map(folder => join(folder, 'bash'))
    .find(candidate => existsSync(candidate) && isNewEnough(candidate))
}

export const bash = findBash()

const realTools = ['cat', 'cut', 'date', 'grep', 'mkdir', 'rm', 'sed', 'sha256sum', 'tail', 'tr']

type Find = (name: string) => string | undefined

interface GnuTool {
  works: string[]
  otherwise: (find: Find) => string | undefined
}

const takesTheLockOnDescriptorNine =
  'use Fcntl qw(:flock); open(my $lock, ">&=", 9) or exit 1; exit(flock($lock, LOCK_EX | LOCK_NB) ? 0 : 1)'
const runsInItsOwnProcessGroup =
  'setpgrp(0, 0); shift @ARGV while @ARGV && $ARGV[0] =~ /^-/; shift @ARGV; exec { $ARGV[0] } @ARGV'

const withHostTool = (name: string, run: (tool: string) => string) => ({
  otherwise: (find: Find) => {
    const tool = find(name)
    return tool && run(tool)
  }
})

const gnuTools: Record<string, GnuTool> = {
  flock: {
    works: ['--version'],
    ...withHostTool('perl', perl => `exec ${perl} -e '${takesTheLockOnDescriptorNine}'`)
  },
  timeout: {
    works: ['1', 'true'],
    ...withHostTool('perl', perl => `exec ${perl} -e '${runsInItsOwnProcessGroup}' -- "$@"`)
  },
  base64: {
    works: ['--wrap', '0'],
    ...withHostTool('base64', base64 => `shift 2\nexec ${base64} "$@"`)
  },
  xargs: {
    works: ['--no-run-if-empty', 'true'],
    ...withHostTool('xargs', xargs => `shift\nexec ${xargs} "$@"`)
  }
}

const asksTheTest = `read -r port <"\${0%/*}/port" || exit 127
tool="\${0##*/}"
if [ "$tool" = curl ]; then
  config=""
  previous=""
  for argument in "$@"; do
    [ "$previous" = --config ] && config="$(cat "$argument")"
    previous="$argument"
  done
  set -- "$@" "$config" "$(cat)"
fi
exec 3<>"/dev/tcp/127.0.0.1/$port" || exit 127
LC_ALL=C
{
  printf '%s\\n' "$tool" "$#"
  for argument in "$@"; do printf '%s\\n%s\\n' "\${#argument}" "$argument"; done
} >&3
IFS= read -r status <&3
IFS= read -r complaint <&3
[ -z "$complaint" ] || printf '%s\\n' "$complaint" >&2
output=""
while IFS= read -r line <&3 || [ -n "$line" ]; do output+="$line"$'\\n'; done
printf '%s' "$output"
exit "\${status:-125}"
`

interface HostTools {
  folder: string
  standIn: string
  others: Record<string, string>
  shimmed: string[]
}

let hostTools: HostTools | undefined

afterAll(() => {
  if (hostTools) rmSync(hostTools.folder, { recursive: true, force: true })
  hostTools = undefined
})

function prepareHostTools(shell: string, hostFolders: readonly string[]): HostTools {
  const folder = mkdtempSync(join(tmpdir(), 'zenbu-stand-ins-'))
  const find: Find = name =>
    hostFolders.map(each => join(each, name)).find(candidate => existsSync(candidate))
  const write = (name: string, text: string) => {
    writeFileSync(join(folder, name), `#!${shell}\n${text}\n`)
    chmodSync(join(folder, name), 0o755)
    return join(folder, name)
  }
  const missing = (tool: string) =>
    new Error(`the deployer needs ${tool}, which this machine doesn't have`)
  const others: Record<string, string> = {}
  const shimmed: string[] = []
  for (const tool of realTools) {
    const real = find(tool)
    if (!real) throw missing(tool)
    others[tool] = real
  }
  for (const [tool, { works, otherwise }] of Object.entries(gnuTools)) {
    const real = find(tool)
    const env = { PATH: hostFolders.join(delimiter) }
    if (real && spawnSync(real, works, { input: '', env }).status === 0) {
      others[tool] = real
      continue
    }
    const shim = otherwise(find)
    if (!shim) throw missing(tool)
    others[tool] = write(tool, shim)
    shimmed.push(tool)
  }
  return { folder, standIn: write('stand-in', asksTheTest), others, shimmed }
}

function parseCall(received: Buffer): Call | undefined {
  let offset = 0
  const line = (): string | undefined => {
    const end = received.indexOf(0x0a, offset)
    if (end === -1) return undefined
    const text = received.toString('utf8', offset, end)
    offset = end + 1
    return text
  }
  const tool = line()
  const count = line()
  if (tool === undefined || count === undefined) return undefined
  const args: string[] = []
  for (let index = 0; index < Number(count); index++) {
    const length = line()
    if (length === undefined || received.length < offset + Number(length) + 1) return undefined
    args.push(received.toString('utf8', offset, offset + Number(length)))
    offset += Number(length) + 1
  }
  return { tool, args }
}

export async function installStandIns(
  folder: string,
  shell: string,
  hostFolders: readonly string[],
  tools: Record<string, StandIn>
) {
  hostTools ??= prepareHostTools(shell, hostFolders)
  const { standIn, others, shimmed } = hostTools
  const unknown: string[] = []
  const calls: Call[] = []
  const open = new Set<Socket>()

  const answer = async (call: Call): Promise<Answer> => {
    const asked = `${call.tool} ${call.args.join(' ')}`
    calls.push(call)
    try {
      const answered = await tools[call.tool](call.args)
      if (answered) return answered
      unknown.push(asked)
    } catch (error) {
      unknown.push(`${asked} (${String(error)})`)
    }
    return { status: 2, stderr: `the stand-in ${call.tool} doesn't know: ${asked}` }
  }
  const listener = createServer(socket => {
    let received = Buffer.alloc(0)
    let answering = false
    open.add(socket)
    socket.on('close', () => open.delete(socket))
    socket.on('error', () => {})
    socket.on('data', chunk => {
      received = Buffer.concat([received, chunk])
      const call = answering ? undefined : parseCall(received)
      if (!call) return
      answering = true
      void answer(call).then(({ status = 0, stdout = '', stderr = '' }) => {
        if (!socket.destroyed) socket.end(`${status}\n${stderr.replaceAll('\n', ' ')}\n${stdout}`)
      })
    })
  })
  await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve))

  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'port'), `${(listener.address() as { port: number }).port}\n`)
  for (const tool of Object.keys(tools)) symlinkSync(standIn, join(folder, tool))
  for (const [tool, target] of Object.entries(others)) symlinkSync(target, join(folder, tool))

  return {
    shimmed,
    unknown,
    calls,
    remove: (tool: string) => rmSync(join(folder, tool)),
    close: () => {
      for (const socket of open) socket.destroy()
      return new Promise<void>(resolve => listener.close(() => resolve()))
    }
  }
}
