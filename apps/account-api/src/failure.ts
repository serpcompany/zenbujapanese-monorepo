import { errorFields } from '@zenbu/node-service/log'

interface QueryFailure extends Error {
  query: string
  params: unknown[]
}

function isQueryFailure(error: unknown): error is QueryFailure {
  const failure = error as Partial<QueryFailure> | null
  return (
    error instanceof Error &&
    typeof failure?.query === 'string' &&
    Array.isArray(failure.params) &&
    error.message.startsWith('Failed query:')
  )
}

export function failureFields(error: unknown): Record<string, unknown> {
  if (!isQueryFailure(error)) return errorFields(error)
  return { query: error.query, ...errorFields(error.cause ?? 'the query failed') }
}
