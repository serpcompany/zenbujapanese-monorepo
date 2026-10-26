export function bundledSudachiPack(catalog) {
  const bundled = catalog.packs.filter(pack => pack.distribution === 'bundledDefault')
  if (catalog.schemaVersion !== 1 || bundled.length !== 1) {
    throw new Error("The app's catalog doesn't name the one Sudachi pack it bundles")
  }
  return bundled[0]
}
