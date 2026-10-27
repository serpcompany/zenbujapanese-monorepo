import { describe, expect, it } from 'vitest'
import { releaseCheckFailures } from '../e2e/expected.ts'

const matching = {
  release: '2026.10.1',
  manifestSha256: 'a'.repeat(64),
  listedSha256: 'a'.repeat(64),
  file: 'JLPTLevelPack.sqlite3',
  fileSha256: 'b'.repeat(64),
  pinnedSha256: 'b'.repeat(64),
  bytes: 1
}

describe('releaseCheckFailures', () => {
  it('passes when the manifest and the file match the hashes that name them', () => {
    expect(releaseCheckFailures(matching)).toEqual([])
  })

  it('fails a manifest whose SHA-256 is not the one releases.json lists', () => {
    expect(releaseCheckFailures({ ...matching, listedSha256: 'c'.repeat(64) })).toEqual([
      'the manifest does not match the SHA-256 releases.json lists'
    ])
  })

  it('fails a file whose SHA-256 is not the one the manifest pins', () => {
    expect(releaseCheckFailures({ ...matching, pinnedSha256: 'c'.repeat(64) })).toEqual([
      'the downloaded file does not match the manifest SHA-256'
    ])
  })
})
