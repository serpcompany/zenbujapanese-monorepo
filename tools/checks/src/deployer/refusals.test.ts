import { mkdirSync, rmdirSync, rmSync } from 'node:fs'
import { expect, test } from 'vitest'
import { type Image, type ImageSpec, signerOf } from './docker'
import {
  account,
  alertsFile,
  alias,
  database,
  describeDeployer,
  dictionary,
  failedFile,
  network,
  problem,
  registryFile,
  type Server,
  serverWith,
  settingsFile,
  slotA,
  slotB,
  startServer,
  webhook
} from './server'

interface Refusal {
  title: string
  service?: string
  spec?: ImageSpec
  arrange?: (server: Server) => void
  says: (image: Image) => string
}

const unsigned = (image: Image) =>
  `${image.reference} isn't signed by .github/workflows/dictionary-api-deploy.yml on main; not deploying it`
const unready =
  (service: string, privateNetworks = 'none') =>
  () =>
    `the zenbujapanese-${service} network is missing, isn't as internal as it should be, or doesn't have nginx on it, or a private network (${privateNetworks}) is missing or reaches out, so a slot there couldn't serve; not deploying (docs/agents/api-servers.md, Set up the server)`
const lockFile = `run/${network}.lock`
const refusing = (command: string) => (server: Server) => server.docker.refuse(command)
const again = (server: Server) =>
  `It's tried again when the tag moves or ${server.path(settingsFile)} changes, or after: rm ${server.path(failedFile)}`

const refusals: Refusal[] = [
  { title: 'an image nobody signed', spec: { signedBy: null }, says: unsigned },
  {
    title: 'an image a branch signed',
    spec: { signedBy: signerOf(dictionary, 'refs/heads/some-branch') },
    says: unsigned
  },
  {
    title: "an image another service's workflow signed",
    spec: { signedBy: signerOf(account) },
    says: unsigned
  },
  {
    title: 'an image that declares volumes',
    spec: { volumes: 1 },
    says: image => `${image.reference} declares volumes, which a slot never needs; not deploying it`
  },
  {
    title: 'an image that names no release',
    spec: { release: null },
    says: image => `${image.id} names no DICTIONARY_API_RELEASE; not deploying it`
  },
  {
    title: 'an image with no digest in its repository',
    spec: { digest: false },
    says: image =>
      `${image.id} has no digest in ghcr.io/serpcompany/zenbujapanese-dictionary-api; not deploying it`
  },
  {
    title: 'any image while cosign is missing',
    arrange: server => server.standIns.remove('cosign'),
    says: image =>
      `cosign isn't installed, so no image can be verified; not deploying ${image.reference}`
  },
  {
    title: "any image while the slots' network is missing",
    arrange: server => server.docker.networks.delete(network),
    says: unready(dictionary)
  },
  {
    title: "any image while the slots' network reaches out",
    arrange: server => server.docker.networks.set(network, { internal: false, members: ['nginx'] }),
    says: unready(dictionary)
  },
  {
    title: "any image while nginx isn't on the slots' network",
    arrange: server => server.docker.networks.set(network, { internal: true, members: [] }),
    says: unready(dictionary)
  },
  {
    title: "any account image while the database's network is missing",
    service: account,
    arrange: server => server.docker.networks.delete(database),
    says: unready(account, database)
  },
  {
    title: "any account image while the database's network reaches out",
    service: account,
    arrange: server => server.docker.networks.set(database, { internal: false, members: [] }),
    says: unready(account, database)
  },
  {
    title: "an image the registry won't hand over",
    arrange: refusing('pull'),
    says: () =>
      "couldn't read ghcr.io/serpcompany/zenbujapanese-dictionary-api:staging from the registry"
  },
  {
    title: "an image while both slots' names are taken",
    arrange: server => [slotA, slotB].forEach(name => void server.docker.add(name)),
    says: () =>
      `both slots' names are taken (${slotA}, ${slotB}); remove the one that isn't serving`
  },
  {
    title: "an image Docker can't create a container for",
    arrange: refusing('create'),
    says: image => `couldn't create a container for ${image.reference}`
  },
  {
    title: "an image Docker can't start",
    arrange: refusing('start'),
    says: image => `couldn't start ${image.reference}; kept the running version`
  },
  {
    title: "an image Docker can't give the alias",
    arrange: refusing('network disconnect'),
    says: image =>
      `couldn't give ${image.reference} the network alias ${alias}; kept the running version`
  },
  {
    title: "an account image Docker can't connect to the database",
    service: account,
    arrange: refusing(`network connect ${database}`),
    says: image =>
      `couldn't connect ${image.reference} to the ${database} network; kept the running version`
  },
  {
    title: "an image whose check fails in a way the script doesn't expect",
    arrange: refusing('image inspect --format {{.Id}}'),
    says: () =>
      'its check failed without a reason the script knows; running the deployer by hand shows the error'
  }
]

interface Stoppage {
  title: string
  condition: string
  spoil: (server: Server) => void
  repair: (server: Server) => void
  says: (server: Server) => string
}

const stoppages: Stoppage[] = [
  {
    title: 'registry.env is missing a setting',
    condition: 'registry',
    spoil: server => server.write(registryFile, 'GHCR_USERNAME=deployer\n'),
    repair: server =>
      server.write(registryFile, 'GHCR_USERNAME=deployer\nGHCR_TOKEN=registry-token\n'),
    says: server => `${server.path(registryFile)} needs both GHCR_USERNAME and GHCR_TOKEN`
  },
  {
    title: "it can't open a service's lock",
    condition: 'lock',
    spoil: server => mkdirSync(server.path(lockFile)),
    repair: server => rmdirSync(server.path(lockFile)),
    says: server => `couldn't open its lock, ${server.path(lockFile)}, so it deployed nothing`
  }
]

describeDeployer('the deployer', () => {
  test.each(refusals)('refuses $title, and says so once', async refusal => {
    const service = refusal.service ?? dictionary
    const server = await serverWith(service)
    const image = server.docker.publish(service, 'staging', refusal.spec)
    refusal.arrange?.(server)
    const run = await server.run()
    const said = `staging: ${refusal.says(image)}`
    expect(run.status).toBe(1)
    expect(server.lines().join('\n')).toContain(`${service}: ${said}`)
    expect(server.messages()).toEqual([problem(said, service)])
    expect(server.slots(service)).toEqual([])
    expect(server.docker.containers.filter(each => each.createdWith.length)).toEqual([])
    expect(server.asked('docker rm --force')).toBeLessThan(server.asked('curl'))
    await server.run()
    expect(server.messages()).toHaveLength(1)
  })

  test("removes an image that doesn't come up, records it, and skips it until told to try again", async () => {
    const server = await serverWith()
    const good = server.docker.publish(dictionary, 'staging')
    await server.run()
    const image = server.docker.publish(dictionary, 'staging', {
      release: 'abc123',
      stays: false,
      log: ['listening', 'crashed']
    })
    const failed = problem(
      `staging: ${image.reference} didn't answer /healthz; kept the running version. ${again(server)}`
    )
    expect((await server.run()).status).toBe(1)
    expect(server.slots(dictionary).map(each => [each.name, each.image])).toEqual([
      [slotA, good.id]
    ])
    expect(server.docker.containers).toHaveLength(1)
    expect(server.read(failedFile)).toMatch(
      new RegExp(
        `^${image.id} [0-9a-f]{64} [-\\d]+T[:\\d]+Z it didn't answer /healthz as release abc123 \\(see the log above it\\)\n$`
      )
    )
    expect(server.lines()).toEqual(
      expect.arrayContaining(['dictionary-api:   listening', 'dictionary-api:   crashed'])
    )
    expect(server.messages().slice(1)).toEqual([failed])
    expect((await server.run()).status).toBe(1)
    expect(server.lines().at(-3)).toMatch(`staging: skipping ${image.id}, which failed at `)
    expect(server.messages().slice(1)).toEqual([failed])
    rmSync(server.path(failedFile))
    await server.run()
    expect(server.messages().slice(1)).toEqual([failed, failed])
  })

  test('says once that an image is being skipped, when its failure went unsaid', async () => {
    const server = await startServer()
    server.setUp(dictionary)
    const image = server.docker.publish(dictionary, 'staging', { stays: false })
    await server.run()
    server.write(alertsFile, `SLACK_WEBHOOK_URL=${webhook}\n`)
    await server.run()
    await server.run()
    expect(server.messages()).toEqual([
      expect.stringMatching(
        new RegExp(
          `^Deploy problem: dictionary-api: staging: skipping ${image.id}, which failed at [-\\d]+T[:\\d]+Z: it didn't answer /healthz as release release1 \\(see the log above it\\)\\. `
        )
      )
    ])
    expect(server.messages()[0].endsWith(again(server))).toBe(true)
  })

  test('refuses an image that answers as another release', async () => {
    const server = await serverWith()
    const image = server.docker.publish(dictionary, 'staging', {
      release: 'abc123',
      build: 'def456'
    })
    expect((await server.run()).status).toBe(1)
    expect(server.docker.containers).toEqual([])
    expect(server.read(failedFile)).toContain(image.id)
    expect(server.messages()).toEqual([
      problem(
        `staging: ${image.reference} answers /healthz as def456, not release abc123; kept the running version. ${again(server)}`
      )
    ])
  })

  test.each(
    stoppages
  )('says once that $title, and deploys once that is put right', async stoppage => {
    const server = await serverWith()
    const ownMemory = `run/${network}.alerted-run`
    stoppage.spoil(server)
    server.docker.publish(dictionary, 'staging')
    expect((await server.run()).status).toBe(1)
    await server.run()
    expect(server.messages()).toEqual([problem(stoppage.says(server))])
    expect(server.read(ownMemory)).toBe(`${stoppage.condition}\n`)
    expect(server.lines().join('\n')).not.toContain('an earlier run is still deploying')
    stoppage.repair(server)
    expect((await server.run()).status).toBe(0)
    expect(server.read(ownMemory)).toBeUndefined()
  })
})
