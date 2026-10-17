import { posix } from 'node:path'

const inside = /^(?:src|e2e|scripts|migrations)\/[\w.@[\]()/-]+$/

export function homePackage(doc: string, isFolder: (path: string) => boolean): string | undefined {
  const product = /^(apps\/[^/]+)\/docs\//.exec(doc)?.[1]
  if (product) return product
  const area = /^docs\/agents\/([^/]+)\.md$/.exec(doc)?.[1]
  if (!area) return undefined
  return [`apps/${area}`, `packages/${area}`].find(isFolder)
}

export function packagePath(code: string, home: string): string | undefined {
  const path = code
    .replace(/^\.\//, '')
    .replace(/:\d+(-\d+)?$/, '')
    .replace(/[/:.,]+$/, '')
  return inside.test(path) ? posix.join(home, path) : undefined
}
