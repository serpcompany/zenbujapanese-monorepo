import CryptoKit
import Foundation

extension Sequence where Element == UInt8 {
  var hexString: String {
    map { String(format: "%02x", $0) }.joined()
  }
}

extension Data {
  var sha256: String {
    SHA256.hash(data: self).hexString
  }

  init?(hexString: String) {
    guard hexString.count.isMultiple(of: 2) else { return nil }
    var bytes: [UInt8] = []
    var index = hexString.startIndex
    while index < hexString.endIndex {
      let next = hexString.index(index, offsetBy: 2)
      guard let byte = UInt8(hexString[index..<next], radix: 16) else { return nil }
      bytes.append(byte)
      index = next
    }
    self.init(bytes)
  }

  func hmacSHA256(under key: Data) -> String {
    HMAC<SHA256>.authenticationCode(for: self, using: SymmetricKey(data: key)).hexString
  }
}

protocol ChunkedReader {
  func read(upToCount count: Int) throws -> Data?
}

extension FileHandle: ChunkedReader {}

let fileDigestChunk = 4 * 1_024 * 1_024

func fileSHA256(_ url: URL, cancellable: Bool = false) throws -> String {
  let handle = try FileHandle(forReadingFrom: url)
  defer { try? handle.close() }
  return try sha256(readingChunksFrom: handle, cancellable: cancellable)
}

func sha256(readingChunksFrom reader: some ChunkedReader, cancellable: Bool = false) throws
  -> String
{
  var digest = SHA256()
  var finished = false
  while !finished {
    if cancellable { try Task.checkCancellation() }
    try autoreleasepool {
      let chunk = try reader.read(upToCount: fileDigestChunk) ?? Data()
      digest.update(data: chunk)
      finished = chunk.isEmpty
    }
  }
  return digest.finalize().hexString
}
