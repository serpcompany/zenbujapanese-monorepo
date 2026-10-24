import CryptoKit
import Foundation
import Testing

@testable import SearchExperience

@Suite("File digests")
struct DigestTests {
  final class CountedChunks: ChunkedReader {
    private let contents: Data
    private var offset = 0
    private var alive = 0
    private(set) var mostAliveAtOnce = 0
    private(set) var largestRead = 0

    init(_ contents: Data) {
      self.contents = contents
    }

    func read(upToCount count: Int) throws -> Data? {
      largestRead = max(largestRead, count)
      let end = min(contents.count, offset + count)
      defer { offset = end }
      guard end > offset else { return Data() }
      let bytes = UnsafeMutableRawPointer.allocate(byteCount: end - offset, alignment: 1)
      contents.copyBytes(to: bytes.assumingMemoryBound(to: UInt8.self), from: offset..<end)
      alive += 1
      mostAliveAtOnce = max(mostAliveAtOnce, alive)
      let chunk = NSData(bytesNoCopy: bytes, length: end - offset) { [self] freed, _ in
        freed.deallocate()
        alive -= 1
      }
      _ = Unmanaged.passRetained(chunk).autorelease()
      return chunk as Data
    }
  }

  @Test("hashing a file holds one chunk of it at a time, however long the file")
  func oneChunkAtATime() throws {
    let file = URL.temporaryDirectory.appending(path: "digest-\(UUID().uuidString).bin")
    defer { try? FileManager.default.removeItem(at: file) }
    let contents = (0..<16).reduce(into: Data(capacity: 16 * fileDigestChunk)) { file, chunk in
      file.append(Data(repeating: UInt8(chunk), count: fileDigestChunk))
    }
    try contents.write(to: file)
    let expected = SHA256.hash(data: contents).hexString
    let chunks = CountedChunks(contents)

    #expect(try fileSHA256(file) == expected)
    #expect(try sha256(readingChunksFrom: chunks) == expected)
    #expect(chunks.largestRead == fileDigestChunk)
    #expect(chunks.mostAliveAtOnce == 1)
  }
}
