import { readdirSync, rmSync } from 'node:fs'
import { expect, test } from 'vitest'
import {
  alertsFile,
  deployed,
  describeDeployer,
  dictionary,
  memory,
  network,
  problem,
  serverWith,
  startServer,
  webhook
} from './server'

const ownMemory = 'run/zenbujapanese-deployer.alerted-run'
const unsigned = (reference: string) =>
  `${reference} isn't signed by .github/workflows/dictionary-api-deploy.yml on main; not deploying it`
const stopped = (at: string) =>
  new RegExp(
    `: the deployer stopped before it finished, after \\d+ seconds, at: ${at}\\. Cron stops a run after 25 minutes; anything sooner is an error in the script, which running it by hand shows$`
  )

async function aDeployAndARefusal(settings?: string) {
  const server = await startServer()
  server.setUp(dictionary, { staging: 'PORT=8788\n', production: 'PORT=8788\n' })
  if (settings !== undefined) server.write(alertsFile, settings)
  const good = server.docker.publish(dictionary, 'staging')
  const bad = server.docker.publish(dictionary, 'production', { signedBy: null })
  const run = await server.run()
  return {
    server,
    run,
    success: deployed(`staging: ${good.reference} as release1 in slot a`),
    failure: problem(`production: ${unsigned(bad.reference)}`)
  }
}

describeDeployer("the deployer's Slack alerts", () => {
  test.each([
    ['no settings file', undefined],
    ['an empty settings file', ''],
    ['a settings file with no webhook', 'REPORT_FAILURES=on\nREPORT_SUCCESSES=on\n'],
    ['a webhook left empty', 'SLACK_WEBHOOK_URL=\n']
  ])('sends nothing with %s, and deploys as it always has', async (_, settings) => {
    const { server, run } = await aDeployAndARefusal(settings)
    expect(run.status).toBe(1)
    expect(server.slots(dictionary)).toHaveLength(1)
    expect(server.sent).toEqual([])
    expect(server.lines().join('\n')).not.toMatch(/alert|slack/i)
    expect(readdirSync(server.path('run'))).toEqual([`${network}.lock`])
  })

  test.each([
    ['a bot token', ['xoxb', '1234', 'abcd'].join('-')],
    ['an address that is not https', webhook.replace('https:', 'http:')],
    ['an address on another host', 'https://example.com/services/stand-in'],
    ['an address in quotes', `"${webhook}"`]
  ])('takes a Slack webhook address and not %s', async (_, value) => {
    const { server } = await aDeployAndARefusal(`SLACK_WEBHOOK_URL=${value}\n`)
    expect(server.sent).toEqual([])
    expect(server.lines()).toContain(
      `deployer: SLACK_WEBHOOK_URL in ${server.path(alertsFile)} isn't a Slack webhook address (https://hooks.slack.com/...), so no alert is sent`
    )
    expect(server.lines().join('\n')).not.toContain(value)
    expect(server.tags()).toContain('zenbujapanese-deployer')
  })

  test.each([
    ['both, given only a webhook', '', true, true],
    ['both, with both switched on', 'REPORT_FAILURES=on\nREPORT_SUCCESSES=on\n', true, true],
    ['successes alone, with REPORT_FAILURES=off', 'REPORT_FAILURES=off\n', false, true],
    ['failures alone, with REPORT_SUCCESSES=off', 'REPORT_SUCCESSES=off\r\n', true, false],
    ['neither, with both off', 'REPORT_FAILURES=off\nREPORT_SUCCESSES=off\n', false, false],
    [
      'both, when a switch says anything but off',
      'REPORT_FAILURES=no\nREPORT_SUCCESSES=0\n',
      true,
      true
    ],
    [
      'what its last line says, for a switch set twice',
      'REPORT_SUCCESSES=off\nREPORT_SUCCESSES=on\n',
      true,
      true
    ]
  ])('reports %s', async (_, switches, failures, successes) => {
    const told = await aDeployAndARefusal(`SLACK_WEBHOOK_URL=${webhook}\n${switches}`)
    expect(told.server.messages()).toEqual([
      ...(successes ? [told.success] : []),
      ...(failures ? [told.failure] : [])
    ])
  })

  test('posts JSON to the webhook, with its address off the command line, and gives up in seconds', async () => {
    const { server } = await aDeployAndARefusal(`SLACK_WEBHOOK_URL=${webhook}\n`)
    expect(server.sent).toHaveLength(2)
    for (const { url, body, args } of server.sent) {
      const asked = args.join(' ')
      expect(url).toBe(webhook)
      expect(Object.keys(JSON.parse(body))).toEqual(['text'])
      expect(asked).toMatch(
        /^--silent --output \/dev\/null --write-out %\{http_code\} --fail --proto =https --max-time \d --header Content-Type: application\/json --data-binary @- --config \/dev\/fd\/\d+$/
      )
    }
    expect(server.standIns.calls.flatMap(call => call.args).join('\n')).not.toContain(webhook)
  })

  test('keeps what an image answers from breaking or steering a message', async () => {
    const server = await serverWith()
    const build = 'a "quoted" \\ <!channel> & é\tbuild\n-abc123'
    const image = server.docker.publish(dictionary, 'staging', { release: 'abc123', build })
    expect((await server.run()).status).toBe(0)
    expect(server.messages()).toEqual([
      deployed(
        `staging: ${image.reference} as a "quoted" \\ &lt;!channel&gt; &amp;    build -abc123 in slot a`
      )
    ])
  })

  test('never puts a secret, a setting, or what a container or the registry said in a message', async () => {
    const server = await serverWith()
    const [setting, token, logged, refusal] = ['ENV-SECRET', 'GHCR-SECRET', 'LOG-LINE', 'DENIED']
    server.setUp(dictionary, { staging: `SECRET=${setting}\n`, production: `SECRET=${setting}\n` })
    server.write(`etc/${network}/registry.env`, `GHCR_USERNAME=deployer\nGHCR_TOKEN=${token}\n`)
    server.docker.publish(dictionary, 'staging', { stays: false, log: [logged] })
    server.docker.refuse(`pull --quiet ghcr.io/serpcompany/${network}:production`, refusal)
    await server.run()
    const told = server.sent.map(each => each.body).join('\n')
    const journal = server.lines().join('\n')
    const commandLines = server.standIns.calls
      .filter(call => call.tool !== 'logger')
      .flatMap(call => call.args)
      .join('\n')
    expect(server.messages()).toHaveLength(2)
    for (const secret of [setting, token, logged, refusal, webhook]) {
      expect(told).not.toContain(secret)
    }
    for (const secret of [setting, token, webhook]) {
      expect(journal).not.toContain(secret)
      expect(commandLines).not.toContain(secret)
    }
    expect(journal).toContain(`dictionary-api:   ${logged}`)
    expect(journal).toContain(`from the registry: ${refusal}`)
  })

  test('deploys all the same when Slack takes no message, and says so in the journal', async () => {
    const server = await serverWith()
    Object.assign(server.slack, { status: 28, code: '000' })
    server.docker.publish(dictionary, 'staging')
    expect((await server.run()).status).toBe(0)
    expect(server.slots(dictionary)).toHaveLength(1)
    expect(server.lines()).toContain(
      "dictionary-api: couldn't send an alert to Slack (curl's exit status 28, HTTP status 000)"
    )
    expect(server.lines().join('\n')).not.toContain(webhook)
  })

  test('tries a failure again on each run until Slack takes it, then keeps quiet', async () => {
    const server = await serverWith()
    Object.assign(server.slack, { status: 22, code: '404' })
    server.docker.publish(dictionary, 'staging', { signedBy: null })
    await server.run()
    await server.run()
    expect(server.sent).toHaveLength(2)
    expect(server.read(memory)).toBeUndefined()
    Object.assign(server.slack, { status: 0, code: '200' })
    await server.run()
    await server.run()
    expect(server.sent).toHaveLength(3)
    expect(server.lines().filter(line => line.includes("couldn't send"))).toEqual(
      Array(2).fill(
        "dictionary-api: couldn't send an alert to Slack (curl's exit status 22, HTTP status 404)"
      )
    )
  })

  test("remembers what it reported, beside the service's lock, until the environment deploys", async () => {
    const server = await serverWith()
    const first = server.docker.publish(dictionary, 'staging', { signedBy: null })
    await server.run()
    expect(server.read(memory)).toBe(`unsigned ${first.reference}\n`)
    const second = server.docker.publish(dictionary, 'staging', { volumes: 2 })
    await server.run()
    await server.run()
    expect(server.read(memory)).toBe(`volumes ${second.reference}\n`)
    expect(server.messages()).toHaveLength(2)
    server.docker.publish(dictionary, 'staging')
    expect((await server.run()).status).toBe(0)
    expect(server.read(memory)).toBeUndefined()
    expect(server.messages()).toHaveLength(3)
  })

  test('reports a standing failure again once its record is removed', async () => {
    const server = await serverWith()
    const image = server.docker.publish(dictionary, 'staging', { signedBy: null })
    await server.run()
    rmSync(server.path(memory))
    await server.run()
    expect(server.messages()).toEqual(
      Array(2).fill(problem(`staging: ${unsigned(image.reference)}`))
    )
  })

  test('says once that runs are being stopped part way, until one finishes', async () => {
    const server = await serverWith()
    server.docker.publish(dictionary, 'staging')
    server.docker.interrupt = args => {
      if (args[0] === 'pull') server.stop()
    }
    expect((await server.run()).signal).toBe('SIGTERM')
    await server.run()
    expect(server.messages()).toEqual([
      expect.stringMatching(stopped('error="\\$\\(docker pull --quiet "\\$repository:.*'))
    ])
    expect(server.messages()[0]).toMatch(/^Deploy problem: dictionary-api: staging: the deployer/)
    expect(server.read(memory)).toBe('stopped\n')
    expect(readdirSync(server.path('tmp'))).toEqual([])
    server.docker.interrupt = undefined
    expect((await server.run()).status).toBe(0)
    expect(server.read(memory)).toBeUndefined()
  })

  test('says when the script itself fails, and where it stopped', async () => {
    const server = await serverWith('new-api')
    server.docker.publish('new-api', 'staging')
    const run = await server.run(text =>
      text.replace('services=(dictionary-api', 'services=(new-api dictionary-api')
    )
    expect(run.status).toBe(1)
    expect(run.output).toContain('release_variable: unbound variable')
    expect(server.messages()).toEqual([
      expect.stringMatching(stopped('report_failure "\\$environment" "release \\$image" .*'))
    ])
    expect(server.messages()[0]).toMatch(/^Deploy problem: new-api: staging: the deployer/)
    expect(readdirSync(server.path('tmp'))).toEqual([])
  })

  test("says once that it couldn't make its working folder, and deploys once it can", async () => {
    const server = await serverWith()
    server.docker.publish(dictionary, 'staging')
    server.host.roomForFolders = false
    expect((await server.run()).status).toBe(1)
    await server.run()
    expect(server.messages()).toEqual([
      problem("couldn't make its working folder (mktemp -d), so it deployed nothing", 'deployer')
    ])
    expect(server.read(ownMemory)).toBe('folder\n')
    expect(readdirSync(server.path('var/lib'))).toEqual([])
    server.host.roomForFolders = true
    expect((await server.run()).status).toBe(0)
    expect(server.read(ownMemory)).toBeUndefined()
  })
})

describeDeployer("the deployer's tests", () => {
  test.runIf(process.platform === 'linux')(
    "run the script with Linux's own GNU tools",
    async () => {
      expect((await startServer()).standIns.shimmed).toEqual([])
    }
  )

  test.each([
    [
      "names a folder of the server's outside the scratch tree",
      (text: string) => `${text}touch /etc/cron.d/zenbujapanese-deployer\n`,
      '/etc/cron.d/zenbujapanese-deployer'
    ],
    [
      'no longer pins its PATH',
      (text: string) => text.replace(/^export PATH=.*$/m, ''),
      'it sets PATH more or less than once'
    ]
  ])('refuse to run a copy of the script that %s', async (_, edit, complaint) => {
    const server = await serverWith()
    await expect(server.run(edit)).rejects.toThrow(complaint)
    expect(server.standIns.calls).toEqual([])
  })

  test('give the script nothing to run but the stand-ins and the tools it is known to use', async () => {
    const server = await serverWith()
    const run = await server.run(text => text.replace(/^use_alerts$/m, 'use_alerts\nhostname'))
    expect(run.output).toContain('hostname: command not found')
  })
})
