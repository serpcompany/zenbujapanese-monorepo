export const signInCode = { length: 6, pattern: '[0-9]{6}' } as const

const wholeCode = new RegExp(`^${signInCode.pattern}$`)

export function signInCodeOf(typed: string): string | null {
  const code = typed.trim()
  return wholeCode.test(code) ? code : null
}
