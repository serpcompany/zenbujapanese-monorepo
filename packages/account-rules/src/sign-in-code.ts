const digits = '[0-9]{6}'

export const signInCode = { length: 6, typedPattern: `\\s*${digits}\\s*` } as const

const wholeCode = new RegExp(`^${digits}$`)

export function signInCodeOf(typed: string): string | null {
  const code = typed.trim()
  return wholeCode.test(code) ? code : null
}
