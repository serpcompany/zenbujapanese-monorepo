const fs = require('node:fs')

const fail = message => {
  const text = String(message).replace(/[\r\n%]+/g, ' ')
  console.log(`::error title=Couldn't tell whether a later run exists::${text}`)
  process.exit(1)
}

const deploy = () => fs.appendFileSync(process.env.GITHUB_OUTPUT, 'deploy=true\n')

const main = async () => {
  if (process.env.GITHUB_RUN_ATTEMPT === '1') return deploy()
  const workflow = process.env.WORKFLOW
  const branch = process.env.GITHUB_REF_NAME
  const mine = Number(process.env.GITHUB_RUN_NUMBER)
  if (!workflow || !branch || !Number.isInteger(mine)) {
    fail('WORKFLOW, GITHUB_REF_NAME, and GITHUB_RUN_NUMBER must be set.')
  }
  const api = process.env.GITHUB_API_URL || 'https://api.github.com'
  const path = `/repos/${process.env.GITHUB_REPOSITORY}/actions/workflows/${workflow}/runs`
  const response = await fetch(`${api}${path}?branch=${encodeURIComponent(branch)}&per_page=30`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })
  if (!response.ok) fail(`GET ${path} returned ${response.status}`)
  const runs = (await response.json()).workflow_runs
  if (!Array.isArray(runs)) fail(`GET ${path} listed no runs`)
  const later = runs
    .filter(run => run.event !== 'pull_request' && run.run_number > mine)
    .map(run => run.run_number)
  if (later.length === 0) return deploy()
  console.log(
    `::notice title=A later run has taken over::This is run ${mine} of ${workflow} started again, and run ${Math.max(...later)} on ${branch} is later, so this one deploys nothing. To put an old build back, start a new run.`
  )
}

main().catch(error => fail(error?.message))
