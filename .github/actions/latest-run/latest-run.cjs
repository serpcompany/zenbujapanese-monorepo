const notStarted = new Set(['queued', 'pending', 'requested'])

const fail = (title, message) => {
  console.log(`::error title=${title}::${String(message).replace(/[\r\n%]+/g, ' ')}`)
  process.exit(1)
}

const main = async () => {
  if (process.env.GITHUB_RUN_ATTEMPT === '1') return
  const workflow = process.env.WORKFLOW
  const branch = process.env.GITHUB_REF_NAME
  const mine = Number(process.env.GITHUB_RUN_NUMBER)
  if (!workflow || !branch || !Number.isInteger(mine)) {
    throw new Error('WORKFLOW, GITHUB_REF_NAME, and GITHUB_RUN_NUMBER must be set.')
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
  if (!response.ok) throw new Error(`GET ${path} returned ${response.status}`)
  const runs = (await response.json()).workflow_runs
  if (!Array.isArray(runs)) throw new Error(`GET ${path} listed no runs`)
  const later = runs
    .filter(
      run =>
        run.event !== 'pull_request' && run.run_number > mine && !notStarted.has(run.status)
    )
    .map(run => run.run_number)
  if (later.length > 0) {
    fail(
      'A later run has already started',
      `This is run ${mine} of ${workflow} started again, and run ${Math.max(...later)} on ${branch} started after it, so this one deploys nothing: it would put old code over new. Start the latest run again, or a new one to put an old build back.`
    )
  }
}

main().catch(error => fail("Couldn't tell whether a later run exists", error?.message))
