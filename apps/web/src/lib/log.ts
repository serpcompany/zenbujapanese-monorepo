type Level = 'info' | 'warn' | 'error'

export function log(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields })
  if (level === 'error') console.error(line)
  else console.log(line)
}

export function errorFields(error: unknown): Record<string, unknown> {
  return error instanceof Error
    ? { error: error.message, errorName: error.name, stack: error.stack }
    : { error: String(error) }
}
