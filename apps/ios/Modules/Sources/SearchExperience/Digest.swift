import CryptoKit
import Foundation

extension Sequence where Element == UInt8 {
  /// Lowercase hexadecimal, two digits per byte.
  var hexString: String {
    map { String(format: "%02x", $0) }.joined()
  }
}

extension Data {
  var sha256: String {
    SHA256.hash(data: self).hexString
  }
}

/// Streams the file through SHA-256 in 4 MiB chunks instead of loading it into memory.
/// A `cancellable` hash throws `CancellationError` between chunks once its task is cancelled.
func fileSHA256(_ url: URL, cancellable: Bool = false) throws -> String {
  let handle = try FileHandle(forReadingFrom: url)
  defer { try? handle.close() }
  var digest = SHA256()
  while true {
    if cancellable { try Task.checkCancellation() }
    let chunk = try handle.read(upToCount: 4 * 1_024 * 1_024) ?? Data()
    if chunk.isEmpty { break }
    digest.update(data: chunk)
  }
  return digest.finalize().hexString
}
