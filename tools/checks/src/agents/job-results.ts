import type { Workflow } from './workflow'

type Value = string | boolean | null | Value[] | { [key: string]: Value }
type Call = (...values: Value[]) => Value
type Result = 'success' | 'failure' | 'skipped'

export interface Trigger {
  event: 'pull_request' | 'merge_group' | 'workflow_dispatch' | 'push'
  changed: boolean
  failing?: readonly string[]
  vars?: Record<string, string>
  author?: { login: string; type: 'User' | 'Bot' }
  draft?: boolean
}

const statusCheck = /\b(always|success|failure|cancelled)\(\)/
const tokens = /\|\||&&|==|!=|[()!,]|'[^']*'|[\w.*-]+/g

const isRecord = (value: Value): value is { [key: string]: Value } =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const property = (value: Value, key: string): Value =>
  isRecord(value) ? (value[key] ?? null) : null

function lookUp(scope: Value, path: string): Value {
  return path.split('.').reduce<Value>((value, key) => {
    if (Array.isArray(value)) return value.map(each => property(each, key))
    if (key === '*') return isRecord(value) ? Object.values(value) : []
    return property(value, key)
  }, scope)
}

function holds(expression: string, scope: Value, calls: Record<string, Call>): boolean {
  const parts = expression.match(tokens) ?? []
  let at = 0
  const either = (): Value => {
    let left = both()
    while (parts[at] === '||') {
      at++
      const right = both()
      left = left || right
    }
    return left
  }
  const both = (): Value => {
    let left = compared()
    while (parts[at] === '&&') {
      at++
      const right = compared()
      left = left && right
    }
    return left
  }
  const compared = (): Value => {
    const left = negated()
    const operator = parts[at]
    if (operator !== '==' && operator !== '!=') return left
    at++
    return (left === negated()) === (operator === '==')
  }
  const negated = (): Value => {
    if (parts[at] !== '!') return single()
    at++
    return !negated()
  }
  const single = (): Value => {
    const part = parts[at++] ?? ''
    if (part === '(') {
      const inner = either()
      at++
      return inner
    }
    if (part.startsWith("'")) return part.slice(1, -1)
    if (parts[at] !== '(') return lookUp(scope, part)
    at++
    const given: Value[] = []
    while (at < parts.length && parts[at] !== ')') {
      given.push(either())
      if (parts[at] === ',') at++
    }
    at++
    const call = calls[part]
    if (!call) throw new Error(`No ${part}() in: ${expression}`)
    return call(...given)
  }
  return Boolean(either())
}

export function jobResults(workflow: Workflow, trigger: Trigger): Record<string, Result> {
  const results: Record<string, Result> = {}
  const needed = (name: string) => [workflow.jobs[name].needs ?? []].flat()
  const before = (name: string): string[] => needed(name).flatMap(each => [each, ...before(each)])
  const outputs = (name: string): Value =>
    name === 'changes' && resultOf(name) === 'success' ? { changed: String(trigger.changed) } : {}

  function resultOf(name: string): Result {
    results[name] ??= conclude(name)
    return results[name]
  }

  function conclude(name: string): Result {
    const job = workflow.jobs[name]
    const earlier = before(name).map(resultOf)
    const scope: Value = {
      github: {
        event_name: trigger.event,
        event:
          trigger.event === 'pull_request'
            ? { pull_request: { draft: trigger.draft ?? false, user: trigger.author ?? null } }
            : {}
      },
      vars: trigger.vars ?? {},
      needs: Object.fromEntries(
        needed(name).map(each => [each, { result: resultOf(each), outputs: outputs(each) }])
      )
    }
    const calls: Record<string, Call> = {
      always: () => true,
      success: () => earlier.every(result => result === 'success'),
      failure: () => earlier.includes('failure'),
      cancelled: () => false,
      contains: (list, item) => Array.isArray(list) && list.includes(item),
      fromJSON: text => JSON.parse(String(text)) as Value
    }
    const condition = job.if ?? 'success()'
    const starts = holds(
      statusCheck.test(condition) ? condition : `success() && (${condition})`,
      scope,
      calls
    )
    if (!starts) return 'skipped'
    if (trigger.failing?.includes(name)) return 'failure'
    const inSteps = { ...calls, success: () => true, failure: () => false }
    const stops = (job.steps ?? []).some(
      step => step.run === 'exit 1' && holds(step.if ?? 'success()', scope, inSteps)
    )
    return stops ? 'failure' : 'success'
  }

  for (const name of Object.keys(workflow.jobs)) resultOf(name)
  return results
}
