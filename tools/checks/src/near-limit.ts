import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isMeasuredCode, root, type VerifyConfig } from './files'

export const lineLimit = 500

export const nearLimitLines = 450

function lineCount(text: string): number {
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

export function filesNearLimit(
  files: readonly string[],
  config: VerifyConfig,
  folder = root
): { path: string; lines: number }[] {
  const excepted = config.exceptions?.knownLargeFiles ?? {}
  return files
    .filter(path => isMeasuredCode(path, config, folder) && excepted[path] === undefined)
    .map(path => ({ path, lines: lineCount(readFileSync(join(folder, path), 'utf8')) }))
    .filter(({ lines }) => lines >= nearLimitLines && lines <= lineLimit)
    .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path))
}
