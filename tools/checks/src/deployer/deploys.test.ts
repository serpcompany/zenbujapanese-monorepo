import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import {
  account,
  alias,
  database,
  deployed,
  describeDeployer,
  dictionary,
  memory,
  network,
  problem,
  registryFile,
  serverWith,
  settingsFile,
  slotA,
  slotB,
  startServer
} from './server'
import { bash } from './stand-ins'

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
const aPipeHolds = 64 * 1024
const answerLine = 128

test.runIf(Boolean(process.env.CI))('CI has a bash new enough to run the deployer', () => {
  expect(bash).toBeDefined()
})

describeDeployer('the deployer', () => {
  test('deploys a signed image into a free slot, capped and locked down, and says so', async () => {
    const server = await serverWith()
    const image = server.docker.publish(dictionary, 'staging', { release: 'abc123' })
    const run = await server.run()
    const [slot] = server.docker.containers
    const went = `${image.reference} as abc123 in slot a`
    expect(run.status).toBe(0)
    expect(slot).toMatchObject({
      name: slotA,
      image: image.id,
      state: 'running',
      restart: 'unless-stopped',
      labels: {
        'zenbujapanese.dictionary-api.environment': 'staging',
        'zenbujapanese.dictionary-api.slot': 'a',
        'zenbujapanese.dictionary-api.settings': sha256('PORT=8788\n')
      }
    })
    expect([...slot.networks]).toEqual([[network, [alias]]])
    expect(slot.createdWith.join(' ')).toContain(
      `--network ${network} --env-file ${server.path(settingsFile)} --memory 4g --memory-swap 4g --cpus 4 --pids-limit 512 --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs /tmp:size=64m ${image.reference}`
    )
    expect(server.lines()).toContain(`dictionary-api: staging: deployed ${went}`)
    expect(server.messages()).toEqual([deployed(`staging: ${went}`)])
    expect(server.tags()).toEqual(['zenbujapanese-dictionary-api', 'zenbujapanese-account-api'])
    expect(readdirSync(server.path('tmp'))).toEqual([])
  })

  test("gives the account service its own limits, and its database's network before it starts", async () => {
    const server = await serverWith(account)
    const image = server.docker.publish(account, 'staging')
    expect((await server.run()).status).toBe(0)
    const [slot] = server.slots(account)
    expect(slot.createdWith.join(' ')).toContain(
      '--memory 512m --memory-swap 512m --cpus 1 --pids-limit 256'
    )
    expect([...slot.networks.keys()]).toEqual([database, 'zenbujapanese-account-api'])
    expect(server.asked(`docker network connect ${database}`)).toBeLessThan(
      server.asked('docker start')
    )
    expect(server.messages()).toEqual([
      deployed(`staging: ${image.reference} as release1 in slot a`, account)
    ])
  })

  test('deploys every environment of every service it finds set up, each on its own', async () => {
    const server = await serverWith()
    server.setUp(dictionary, { staging: 'PORT=8788\n', production: 'PORT=8788\n' })
    server.setUp(account)
    const images = [
      server.docker.publish(dictionary, 'staging'),
      server.docker.publish(dictionary, 'production', { signedBy: null }),
      server.docker.publish(account, 'staging')
    ]
    expect((await server.run()).status).toBe(1)
    expect(server.messages()).toEqual([
      deployed(`staging: ${images[0].reference} as release1 in slot a`),
      problem(
        `production: ${images[1].reference} isn't signed by .github/workflows/dictionary-api-deploy.yml on main; not deploying it`
      ),
      deployed(`staging: ${images[2].reference} as release3 in slot a`, account)
    ])
    expect(server.slots(dictionary, 'production')).toEqual([])
  })

  test('gives a new image the alias and waits for nginx before it stops the old one, then prunes', async () => {
    const server = await serverWith()
    const first = server.docker.publish(dictionary, 'staging')
    await server.run()
    const second = server.docker.publish(dictionary, 'staging')
    expect((await server.run()).status).toBe(0)
    expect(server.slots(dictionary).map(each => [each.name, each.image])).toEqual([
      [slotB, second.id]
    ])
    expect(server.docker.find(slotA)).toBeUndefined()
    const order = [
      `docker network connect --alias ${alias}`,
      'sleep 10',
      `docker stop --time 30 ${slotA}`,
      `docker rm --volumes ${slotA}`,
      'curl'
    ].map(server.asked)
    expect(order).toEqual([...order].sort((left, right) => left - right))
    expect(order[0]).toBeGreaterThan(-1)
    expect([...server.docker.images.keys()]).toEqual([first.id, second.id])
    const third = server.docker.publish(dictionary, 'staging')
    await server.run()
    expect([...server.docker.images.keys()]).toEqual([second.id, third.id])
    expect(server.messages()).toHaveLength(3)
  })

  test('finds what it looks for first in an answer from Docker longer than a pipe holds', async () => {
    const server = await serverWith()
    const others = Array.from({ length: (4 * aPipeHolds) / answerLine }, (_, index) =>
      `other-${index}`.padEnd(answerLine - 1, '-')
    )
    const otherDigests = others.map(
      (_, index) => `ghcr.io/serpcompany/other@sha256:${index.toString(16).padStart(64, '0')}`
    )
    server.docker.networks.get(network)?.members.push(...others)
    const image = server.docker.publish(dictionary, 'staging', { otherDigests })
    expect((await server.run()).status).toBe(0)
    const [slot] = server.slots(dictionary)
    slot.networks.set(network, [alias, ...others])
    for (const other of others) slot.networks.set(other, [])
    expect((await server.run()).status).toBe(0)
    expect(server.messages()).toEqual([
      deployed(`staging: ${image.reference} as release1 in slot a`)
    ])
  })

  test("says once that it can't stop the old slot, and that the deploy is finished once it can", async () => {
    const server = await serverWith()
    server.docker.publish(dictionary, 'staging')
    await server.run()
    const image = server.docker.publish(dictionary, 'staging', { release: 'abc123' })
    server.docker.refuse('stop')
    expect((await server.run()).status).toBe(0)
    expect((await server.run()).status).toBe(1)
    await server.run()
    expect(server.messages().slice(1)).toEqual([
      deployed(`staging: ${image.reference} as abc123 in slot b`),
      problem(
        `staging: couldn't stop and remove ${slotA}, left from an earlier deploy; while it runs, it serves beside ${slotB}`
      )
    ])
    server.docker.refusals.length = 0
    expect((await server.run()).status).toBe(0)
    expect(server.slots(dictionary).map(each => each.name)).toEqual([slotB])
    expect(server.messages().at(-1)).toBe(
      deployed(`staging: ${image.reference} as abc123 in ${slotB}, finishing an earlier deploy`)
    )
  })

  test("deploys the same image again when the environment's file changes, and not otherwise", async () => {
    const server = await serverWith()
    const image = server.docker.publish(dictionary, 'staging')
    await server.run()
    await server.run()
    expect(server.messages()).toHaveLength(1)
    server.write(settingsFile, 'PORT=8788\nLOG_LEVEL=debug\n')
    expect((await server.run()).status).toBe(0)
    expect(server.lines()).toContain(
      `dictionary-api: staging: ${server.path(settingsFile)} changed since ${slotA} started; deploying ${image.id} again`
    )
    expect(server.slots(dictionary).map(each => each.name)).toEqual([slotB])
    expect(server.messages()).toHaveLength(2)
  })

  test('waits for a new slot to answer /healthz', async () => {
    const server = await serverWith()
    server.docker.publish(dictionary, 'staging', { answers: [undefined, undefined, 'release1'] })
    expect((await server.run()).status).toBe(0)
    expect(server.slept).toEqual(['2', '2'])
  })

  test('says when the serving slot stops answering, and again only once it has answered', async () => {
    const server = await serverWith()
    server.docker.publish(dictionary, 'staging', { release: 'abc123' })
    await server.run()
    const [slot] = server.docker.containers
    const said = problem(
      `staging: ${slotA} doesn't answer /healthz as release abc123; left as it is`
    )
    slot.answers = [undefined]
    expect((await server.run()).status).toBe(1)
    await server.run()
    expect(server.messages().slice(1)).toEqual([said])
    slot.answers = ['abc123']
    expect((await server.run()).status).toBe(0)
    slot.answers = [undefined]
    await server.run()
    expect(server.messages().slice(1)).toEqual([said, said])
    expect(server.docker.containers).toEqual([slot])
  })

  test('says a run was cut short, and the next run finishes its deploy and says that too', async () => {
    const server = await serverWith()
    server.docker.publish(dictionary, 'staging')
    await server.run()
    const image = server.docker.publish(dictionary, 'staging', {
      release: 'abc123',
      answers: [undefined, 'abc123']
    })
    server.docker.interrupt = args => {
      if (args.join(' ').startsWith('inspect --format {{.State.Running}}')) server.stop()
    }
    const cut = await server.run()
    expect(cut.signal).toBe('SIGTERM')
    expect(server.messages()[1]).toMatch(
      /^Deploy problem: dictionary-api: staging: the deployer stopped before it finished, after \d+ seconds, at: \[ "\$\(docker inspect --format .*\. Cron stops a run after 25 minutes; anything sooner is an error in the script, which running it by hand shows$/
    )
    expect(server.slots(dictionary).map(each => each.name)).toEqual([slotA, slotB])
    expect(readdirSync(server.path('tmp'))).toEqual([])
    server.docker.interrupt = undefined
    expect((await server.run()).status).toBe(0)
    expect(server.slots(dictionary).map(each => [each.name, each.restart])).toEqual([
      [slotB, 'unless-stopped']
    ])
    expect(server.docker.find(slotB)?.networks.get(network)).toEqual([alias])
    expect(server.messages().slice(2)).toEqual([
      deployed(`staging: ${image.reference} as abc123 in ${slotB}, finishing an earlier deploy`)
    ])
    expect(server.read(memory)).toBeUndefined()
  })

  test('logs in to the registry for the run only, from a folder that is gone when the run ends', async () => {
    const server = await serverWith()
    let login: unknown
    server.write(registryFile, 'GHCR_USERNAME=deployer\r\nGHCR_TOKEN=registry-token\r\n')
    server.docker.publish(dictionary, 'staging')
    server.docker.interrupt = args => {
      if (args[0] !== 'pull') return
      const [folder] = readdirSync(server.path('tmp'))
      login = JSON.parse(
        readFileSync(server.path('tmp', folder, 'dictionary-api/docker/config.json'), 'utf8')
      )
    }
    expect((await server.run()).status).toBe(0)
    expect(login).toEqual({
      auths: { 'ghcr.io': { auth: Buffer.from('deployer:registry-token').toString('base64') } }
    })
    expect(readdirSync(server.path('tmp'))).toEqual([])
  })

  test('skips a service while an earlier run still deploys it, and says nothing', async () => {
    const server = await serverWith()
    let reached = () => {}
    let release = () => {}
    const pulling = new Promise<void>(resolve => {
      reached = resolve
    })
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    server.docker.publish(dictionary, 'staging')
    server.docker.interrupt = args => {
      if (args[0] !== 'pull') return
      reached()
      return held
    }
    const earlier = server.run()
    await pulling
    expect((await server.run()).status).toBe(0)
    expect(server.lines()).toContain(
      'dictionary-api: an earlier run is still deploying; this one skips'
    )
    expect(server.sent).toEqual([])
    release()
    expect((await earlier).status).toBe(0)
    expect(server.messages()).toHaveLength(1)
  })

  test("skips what isn't set up on the server, and fails nothing", async () => {
    const server = await startServer()
    const run = await server.run()
    expect(run.status).toBe(0)
    expect(server.lines()).toEqual(
      [dictionary, account].map(
        service =>
          `${service}: skipped; it isn't set up on this server (${server.path(`etc/zenbujapanese-${service}`)} is missing)`
      )
    )
    expect(server.standIns.calls.map(call => call.tool)).toEqual([
      'id',
      'mktemp',
      'logger',
      'logger'
    ])
  })

  test('runs only as root', async () => {
    const server = await serverWith()
    server.host.user = '1000'
    const run = await server.run()
    expect(run).toMatchObject({ status: 1, output: 'run it as root (cron does)\n' })
    expect(server.standIns.calls.map(call => call.tool)).toEqual(['id'])
  })
})
