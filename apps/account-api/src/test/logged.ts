import { vi } from 'vitest'

export function logged() {
  const lines: string[] = []
  const collect = (chunk: unknown) => {
    lines.push(String(chunk))
    return true
  }
  vi.spyOn(process.stdout, 'write').mockImplementation(collect)
  vi.spyOn(process.stderr, 'write').mockImplementation(collect)
  return () => lines.join('')
}
