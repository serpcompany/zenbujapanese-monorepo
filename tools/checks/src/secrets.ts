import { closeSync, openSync, readSync } from 'node:fs'
import { join } from 'node:path'
import { createEngine } from '@secretlint/node'
import { root } from './files'

const sampledBytes = 8000

function isText(path: string): boolean {
  const sample = Buffer.alloc(sampledBytes)
  const file = openSync(join(root, path), 'r')
  try {
    const read = readSync(file, sample, 0, sampledBytes, 0)
    return !sample.subarray(0, read).includes(0)
  } finally {
    closeSync(file)
  }
}

export async function findSecrets(files: readonly string[]): Promise<string[]> {
  const text = files.filter(isText)
  if (!text.length) return []
  const engine = await createEngine({
    cwd: root,
    configFileJSON: { rules: [{ id: '@secretlint/secretlint-rule-preset-recommend' }] },
    formatter: 'stylish',
    color: false,
    maskSecrets: true
  })
  const { ok, output } = await engine.executeOnFiles({
    filePathList: text.map(path => join(root, path))
  })
  if (ok) return []
  return output
    .split('\n')
    .map(line => line.replaceAll(`${root}/`, '').trimEnd())
    .filter(Boolean)
}
