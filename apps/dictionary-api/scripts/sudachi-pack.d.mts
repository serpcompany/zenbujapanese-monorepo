export interface SudachiPack {
  packID: string
  engineVersion: string
  runtimeResourceCommit: string
  downloadURL: string
  downloadSHA256: string
  archiveEntry: string
  installedSHA256: string
  characterDefinitionSHA256: string
  unknownDefinitionSHA256: string
}

export function bundledSudachiPack(catalog: {
  schemaVersion: number
  packs: readonly (SudachiPack & { distribution: string })[]
}): SudachiPack
