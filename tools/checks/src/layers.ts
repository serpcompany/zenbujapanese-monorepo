import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { root } from './files'

export interface SwiftLayer {
  folder: string
  allowedImports: readonly string[]
}

export const swiftLayers: readonly SwiftLayer[] = [
  {
    folder: 'apps/ios/Modules/Sources/TranslatorCore/',
    allowedImports: ['Foundation', 'Observation', 'OSLog']
  }
]

export interface LayerProblem {
  path: string
  line: number
  problem: string
}

const importedModule =
  /^\s*(?:@[\w.]+(?:\([^)]*\))?\s+)*(?:(?:public|package|internal|private|fileprivate)\s+)?import\s+(?:(?:typealias|struct|class|enum|protocol|let|var|func)\s+)?([A-Za-z_]\w*)/

const readRepositoryFile = (path: string) => readFileSync(join(root, path), 'utf8')

export function checkLayers(
  files: readonly string[],
  layers: readonly SwiftLayer[] = swiftLayers,
  read: (path: string) => string = readRepositoryFile
): LayerProblem[] {
  return files.flatMap(path => {
    const layer = layers.find(each => path.startsWith(each.folder) && path.endsWith('.swift'))
    if (!layer) return []
    return read(path)
      .split('\n')
      .flatMap((text, index) => {
        const module = importedModule.exec(text)?.[1]
        if (!module || layer.allowedImports.includes(module)) return []
        return [
          {
            path,
            line: index + 1,
            problem: `imports ${module}; ${layer.folder} may import only ${layer.allowedImports.join(', ')}`
          }
        ]
      })
  })
}
