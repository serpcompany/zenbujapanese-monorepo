const waiting = new Set(['queued', 'pending', 'requested'])

const fail = (title, message) => {
  console.log(`::error title=${title}::${String(message).replace(/[\r\n%]+/g, ' ')}`)
  process.exit(1)
}

const ran = job =>
  job.status === 'in_progress' ||
  (job.status === 'completed' &&
    job.conclusion !== 'skipped' &&
    !(job.conclusion === 'cancelled' && !(job.steps || []).length))

const main = async () => {
  const workflow = process.env.WORKFLOW
  const branch = process.env.GITHUB_REF_NAME
  const job = process.env.GITHUB_JOB
  const mine = Number(process.env.GITHUB_RUN_NUMBER)
  if (!workflow || !branch || !job || !Number.isInteger(mine)) {
    throw new Error('WORKFLOW, GITHUB_REF_NAME, GITHUB_JOB, and GITHUB_RUN_NUMBER must be set.')
  }
  const api = `${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${process.env.GITHUB_REPOSITORY}`
  const get = async path => {
    const response = await fetch(`${api}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })
    if (!response.ok) throw new Error(`GET ${path.split('?')[0]} returned ${response.status}`)
    return response.json()
  }
  const runs = (
    await get(
      `/actions/workflows/${workflow}/runs?branch=${encodeURIComponent(branch)}&per_page=30`
    )
  ).workflow_runs
  if (!Array.isArray(runs)) throw new Error(`GitHub listed no runs of ${workflow}`)
  const later = runs.filter(
    run =>
      run.event !== 'pull_request' &&
      run.run_number > mine &&
      !(waiting.has(run.status) && run.run_attempt === 1)
  )
  for (const run of later) {
    const jobs = (await get(`/actions/runs/${run.id}/jobs?filter=all&per_page=100`)).jobs
    if (!Array.isArray(jobs)) throw new Error(`GitHub listed no jobs for run ${run.run_number}`)
    if (jobs.some(each => each.name === job && ran(each))) {
      fail(
        'A later run has already run this job',
        `This is run ${mine} of ${workflow}, and run ${run.run_number} on ${branch}, which is later, has already run its ${job} job. So this one deploys nothing: it would put old code over new. To deploy an old build on purpose, start a new run.`
      )
    }
  }
}

main().catch(error => fail("Couldn't tell whether a later run exists", error?.message))
