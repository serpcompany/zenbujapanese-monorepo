import { describe, expect, it } from 'vitest'
import { iconAssets } from './extension-config.ts'
import { manifest } from './manifest.ts'

describe('the icons a build emits', () => {
  it("are the files the manifest names, each Zenbu's PNG at the size it is declared for", async () => {
    const declared = manifest('release').icons
    const emitted = await iconAssets()
    expect(emitted.map(icon => icon.fileName)).toEqual(Object.values(declared))
    for (const [size, file] of Object.entries(declared)) {
      const png = emitted.find(icon => icon.fileName === file)?.source
      expect(png?.subarray(1, 4).toString('latin1')).toBe('PNG')
      expect([png?.readUInt32BE(16), png?.readUInt32BE(20)]).toEqual([Number(size), Number(size)])
    }
  })
})
