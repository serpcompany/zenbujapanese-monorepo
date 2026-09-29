// Structured logs: one JSON object per line on stdout, so any host's log collector can read and
// query them.

type Level = 'info' | 'warn' | 'error'

export function log(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields })
  if (level === 'error') process.stderr.write(`${line}\n`)
  else process.stdout.write(`${line}\n`)
}

/** An error's message and stack, for a log line. */
export function errorFields(error: unknown): Record<string, unknown> {
  return error instanceof Error
    ? { error: error.message, stack: error.stack }
    : { error: String(error) }
}
