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
}

let fileDigestChunk = 4 * 1_024 * 1_024

func fileSHA256(_ url: URL, cancellable: Bool = false) throws -> String {
  let handle = try FileHandle(forReadingFrom: url)
  defer { try? handle.close() }
  var digest = SHA256()
  var finished = false
  while !finished {
    if cancellable { try Task.checkCancellation() }
    try autoreleasepool {
      let chunk = try handle.read(upToCount: fileDigestChunk) ?? Data()
      digest.update(data: chunk)
      finished = chunk.isEmpty
    }
  }
  return digest.finalize().hexString
}
