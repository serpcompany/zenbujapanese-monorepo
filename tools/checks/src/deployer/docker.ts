import { writeFileSync } from 'node:fs'
import type { Answer } from './stand-ins'

const repositoryOf = (service: string) => `ghcr.io/serpcompany/zenbujapanese-${service}`

export const signerOf = (service: string, ref = 'refs/heads/main') =>
  `https://github.com/serpcompany/zenbujapanese-monorepo/.github/workflows/${service}-deploy.yml@${ref}`

const releaseVariables: Record<string, string> = {
  'dictionary-api': 'DICTIONARY_API_RELEASE',
  'account-api': 'ACCOUNT_API_RELEASE'
}

export interface ImageSpec {
  release?: string | null
  build?: string
  signedBy?: string | null
  volumes?: number
  digest?: boolean
  answers?: (string | undefined)[]
  stays?: boolean
  log?: string[]
}

export interface Image {
  id: string
  reference: string
  repository: string
  digest: string | undefined
  env: string[]
  volumes: number
  signedBy: string | null
  answers: (string | undefined)[]
  stays: boolean
  log: string[]
}

export interface Container {
  id: string
  name: string
  image: string
  labels: Record<string, string>
  networks: Map<string, string[]>
  state: 'created' | 'running' | 'exited'
  restart: string
  answers: (string | undefined)[]
  stays: boolean
  log: string[]
  createdWith: string[]
}

interface Network {
  internal: boolean
  members: string[]
}

const createOptions = [
  '--cidfile',
  '--name',
  '--label',
  '--network',
  '--env-file',
  '--memory',
  '--memory-swap',
  '--cpus',
  '--pids-limit',
  '--log-driver',
  '--log-opt',
  '--user',
  '--cap-drop',
  '--security-opt',
  '--tmpfs'
]
const changes = ['start', 'stop', 'update', 'logs', 'rm']
const filterKeys = ['label', 'status', 'name']
const imageList = '{{.ID}} {{.Repository}} {{.Tag}} {{.Digest}}'
const networkNames = '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}'
const labelOf = /^\{\{index \.Config\.Labels "(.+)"\}\}$/
const aliasesOn =
  /^\{\{range \(index \.NetworkSettings\.Networks "(.+)"\)\.Aliases\}\}\{\{println \.\}\}\{\{end\}\}$/

const refused = (stderr: string): Answer => ({ status: 1, stderr })
const lines = (values: readonly string[]) => values.map(value => `${value}\n`).join('')
const hex = (prefix: string, count: number) => `${prefix}${count.toString(16).padStart(62, '0')}`

function split(pair: string): [string, string | undefined] {
  const at = pair.indexOf('=')
  return at === -1 ? [pair, undefined] : [pair.slice(0, at), pair.slice(at + 1)]
}

function options(args: readonly string[], valued: readonly string[]) {
  const values: Record<string, string[] | undefined> = {}
  const rest: string[] = []
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (!arg.startsWith('--')) {
      rest.push(arg)
      continue
    }
    const given = values[arg] ?? []
    if (valued.includes(arg)) given.push(args[++index])
    values[arg] = given
  }
  return { values, rest }
}

export class Docker {
  readonly registry = new Map<string, Image>()
  readonly images = new Map<string, Image>()
  readonly tags = new Map<string, string>()
  readonly containers: Container[] = []
  readonly networks = new Map<string, Network>()
  readonly refusals: { command: string; error: string }[] = []
  interrupt: ((args: string[]) => void | Promise<void>) | undefined
  private made = 0

  publish(service: string, tag: string, spec: ImageSpec = {}): Image {
    const count = ++this.made
    const repository = repositoryOf(service)
    const release = spec.release === undefined ? `release${count}` : spec.release
    const digest = spec.digest === false ? undefined : `sha256:${hex('d1', count)}`
    const image: Image = {
      id: `sha256:${hex('1d', count)}`,
      reference: `${repository}@${digest}`,
      repository,
      digest,
      env: [
        'NODE_ENV=production',
        ...(release === null ? [] : [`${releaseVariables[service] ?? 'RELEASE'}=${release}`])
      ],
      volumes: spec.volumes ?? 0,
      signedBy: spec.signedBy === undefined ? signerOf(service) : spec.signedBy,
      answers: spec.answers ?? [spec.build ?? release ?? undefined],
      stays: spec.stays ?? true,
      log: spec.log ?? []
    }
    this.registry.set(`${repository}:${tag}`, image)
    return image
  }

  refuse(command: string, error = 'Error response from daemon: the stand-in refuses'): void {
    this.refusals.push({ command, error })
  }

  add(name: string, fields: Partial<Container> = {}): Container {
    const container: Container = {
      id: hex('c0', ++this.made),
      name,
      image: '',
      labels: {},
      networks: new Map(),
      state: 'running',
      restart: 'no',
      answers: [undefined],
      stays: true,
      log: [],
      createdWith: [],
      ...fields
    }
    this.containers.push(container)
    return container
  }

  find(name: string | undefined): Container | undefined {
    return this.containers.find(each => each.id === name || each.name === name)
  }

  imageAt(reference: string | undefined): Image | undefined {
    return [...this.images.values()].find(each => each.reference === reference)
  }

  async run(args: string[]): Promise<Answer | undefined> {
    await this.interrupt?.(args)
    const refusal = this.refusals.find(each => args.join(' ').startsWith(each.command))
    if (refusal) return refused(refusal.error)
    const [command, ...rest] = args
    if (command === 'pull') return this.pull(rest)
    if (command === 'image') return this.image(rest)
    if (command === 'ps') return this.ps(rest)
    if (command === 'inspect') return this.inspect(rest)
    if (command === 'network') return this.network(rest)
    if (command === 'create') return this.create(rest)
    if (command === 'exec') return this.exec(rest)
    return changes.includes(command) ? this.change(command, rest) : undefined
  }

  private pull([quiet, reference, ...more]: string[]): Answer | undefined {
    if (quiet !== '--quiet' || !reference || more.length) return undefined
    const image = this.registry.get(reference)
    if (!image) {
      return refused(
        `Error response from daemon: manifest for ${reference} not found: manifest unknown`
      )
    }
    this.images.set(image.id, image)
    this.tags.set(reference, image.id)
    return { stdout: `${reference}\n` }
  }

  private image([command, ...rest]: string[]): Answer | undefined {
    const { values, rest: names } = options(rest, ['--format'])
    const format = values['--format']?.[0]
    if (command === 'ls') {
      if (format !== imageList || !values['--no-trunc'] || !values['--digests']) return undefined
      return { stdout: lines([...this.images.values()].flatMap(each => this.listed(each))) }
    }
    const [name] = names
    const image = this.images.get(this.tags.get(name) ?? name) ?? this.imageAt(name)
    if (!image) return refused(`Error response from daemon: No such image: ${name}`)
    if (command === 'rm') return this.forget(name, image)
    if (command !== 'inspect') return undefined
    if (format === '{{.Id}}') return { stdout: `${image.id}\n` }
    if (format === '{{range .Config.Env}}{{println .}}{{end}}') return { stdout: lines(image.env) }
    if (format === '{{range .RepoDigests}}{{println .}}{{end}}') {
      return { stdout: image.digest ? `${image.reference}\n` : '' }
    }
    if (format === '{{len .Config.Volumes}}') return { stdout: `${image.volumes}\n` }
    return undefined
  }

  private listed(image: Image): string[] {
    const tags = [...this.tags].filter(([, id]) => id === image.id).map(([name]) => name)
    const digest = image.digest ?? '<none>'
    return (tags.length ? tags : [`${image.repository}:<none>`]).map(
      name => `${image.id} ${image.repository} ${name.slice(image.repository.length + 1)} ${digest}`
    )
  }

  private forget(name: string, image: Image): Answer {
    if (this.containers.some(each => each.image === image.id)) {
      return refused(
        `Error response from daemon: conflict: unable to remove repository reference "${name}" (must force) - a container is using its referenced image`
      )
    }
    this.tags.delete(name)
    if (![...this.tags.values()].includes(image.id)) this.images.delete(image.id)
    return { stdout: `Untagged: ${name}\n` }
  }

  private ps(args: string[]): Answer | undefined {
    const { values, rest } = options(args, ['--filter', '--format'])
    const format = values['--format']?.[0]
    const shows = values['--quiet'] || format === '{{.ID}}' ? 'id' : 'name'
    const filters = (values['--filter'] ?? []).map(split)
    if (rest.length || (shows === 'name' && format !== '{{.Names}}')) return undefined
    if (!filters.every(([key]) => filterKeys.includes(key))) return undefined
    const states = filters.filter(([key]) => key === 'status').map(([, state]) => state)
    const newestFirst = [...this.containers].reverse()
    const shown = newestFirst.filter(each => {
      if (!values['--all'] && each.state !== 'running') return false
      if (states.length && !states.includes(each.state)) return false
      return filters.every(([key, value = '']) => {
        if (key === 'name') return new RegExp(value).test(`/${each.name}`)
        if (key === 'status') return true
        const [label, wanted] = split(value)
        return wanted === undefined ? label in each.labels : each.labels[label] === wanted
      })
    })
    return { stdout: lines(shown.map(each => each[shows])) }
  }

  private describe(container: Container, format: string): string | undefined {
    const label = labelOf.exec(format)
    if (label) return `${container.labels[label[1]] ?? ''}\n`
    const aliases = aliasesOn.exec(format)
    if (aliases) return lines(container.networks.get(aliases[1]) ?? [])
    if (format === '{{.Image}}') return `${container.image}\n`
    if (format === networkNames) return lines([...container.networks.keys()])
    if (format === '{{.State.Running}}') return `${container.state === 'running'}\n`
    if (format === '{{.HostConfig.RestartPolicy.Name}}') return `${container.restart}\n`
    return undefined
  }

  private inspect(args: string[]): Answer | undefined {
    const { values, rest: names } = options(args, ['--format'])
    let stdout = ''
    for (const name of names) {
      const container = this.find(name)
      if (!container) return refused(`Error: No such object: ${name}`)
      const described = this.describe(container, values['--format']?.[0] ?? '')
      if (described === undefined) return undefined
      stdout += described
    }
    return { stdout }
  }

  private network([command, ...rest]: string[]): Answer | undefined {
    const { values, rest: names } = options(rest, ['--format', '--alias'])
    const [name, containerName] = names
    const network = this.networks.get(name)
    if (!network) return refused(`Error response from daemon: network ${name} not found`)
    if (command === 'inspect') {
      const format = values['--format']?.[0]
      if (format === '{{.Internal}}') return { stdout: `${network.internal}\n` }
      if (format !== '{{range .Containers}}{{.Name}}{{println}}{{end}}') return undefined
      const connected = this.containers.filter(
        each => each.networks.has(name) && each.state === 'running'
      )
      return { stdout: lines([...network.members, ...connected.map(each => each.name)]) }
    }
    const container = this.find(containerName)
    if (!container) {
      return refused(`Error response from daemon: No such container: ${containerName}`)
    }
    if (command === 'connect') container.networks.set(name, values['--alias'] ?? [])
    else if (command === 'disconnect') container.networks.delete(name)
    else return undefined
    return {}
  }

  private create(args: string[]): Answer | undefined {
    const { values, rest } = options(args, createOptions)
    const [reference, ...more] = rest
    const known = [...createOptions, '--read-only']
    const name = values['--name']?.[0]
    const cidfile = values['--cidfile']?.[0]
    const network = values['--network']?.[0]
    if (more.length || !name || !cidfile || !network) return undefined
    if (!Object.keys(values).every(option => known.includes(option))) return undefined
    const image = this.imageAt(reference)
    if (!image) return refused(`Unable to find image '${reference}' locally`)
    if (this.find(name)) {
      return refused(
        `Error response from daemon: Conflict. The container name "/${name}" is already in use`
      )
    }
    const container = this.add(name, {
      image: image.id,
      labels: Object.fromEntries(
        (values['--label'] ?? []).map(split).map(([label, value = '']) => [label, value])
      ),
      networks: new Map([[network, []]]),
      state: 'created',
      answers: [...image.answers],
      stays: image.stays,
      log: image.log,
      createdWith: args
    })
    writeFileSync(cidfile, container.id)
    return { stdout: `${container.id}\n` }
  }

  private exec([name, program, flag, script, ...more]: string[]): Answer | undefined {
    if (program !== 'node' || flag !== '-e' || !script?.includes('/healthz') || more.length) {
      return undefined
    }
    const container = this.find(name)
    if (container?.state !== 'running') {
      return refused(`Error response from daemon: container ${name} is not running`)
    }
    const answer = container.answers.length > 1 ? container.answers.shift() : container.answers[0]
    return answer === undefined ? { status: 1 } : { stdout: `${answer}\n` }
  }

  private change(command: string, args: string[]): Answer | undefined {
    const { values, rest } = options(args, ['--time', '--restart', '--tail'])
    const [name, ...more] = rest
    const container = this.find(name)
    if (more.length) return undefined
    if (!container) return refused(`Error response from daemon: No such container: ${name}`)
    if (command === 'start') container.state = container.stays ? 'running' : 'exited'
    else if (command === 'stop' && values['--time']) container.state = 'exited'
    else if (command === 'update' && values['--restart']) container.restart = values['--restart'][0]
    else if (command === 'logs' && values['--tail']) return { stdout: lines(container.log) }
    else if (command === 'rm' && values['--volumes']) {
      if (container.state === 'running' && !values['--force']) {
        return refused(`Error response from daemon: cannot remove a running container ${name}`)
      }
      this.containers.splice(this.containers.indexOf(container), 1)
    } else return undefined
    return {}
  }
}
