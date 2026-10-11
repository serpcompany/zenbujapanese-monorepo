import Foundation
import zlib

struct InflatedBytes {
  let pointer: UnsafeMutableRawPointer
  let count: Int
}

enum Gunzip {
  private static let smallestFile = 18

  static func inflated(_ gzip: Data) -> InflatedBytes? {
    guard gzip.count > smallestFile else { return nil }
    let size = gzip.suffix(4).reversed().reduce(0) { $0 << 8 | Int($1) }
    guard size > 0 else { return nil }
    var stream = z_stream()
    guard
      inflateInit2_(
        &stream, 16 + MAX_WBITS, ZLIB_VERSION, Int32(MemoryLayout<z_stream>.size)) == Z_OK
    else { return nil }
    defer { inflateEnd(&stream) }
    guard let destination = malloc(size) else { return nil }
    let status = gzip.withUnsafeBytes { source in
      stream.next_in = UnsafeMutablePointer(
        mutating: source.bindMemory(to: Bytef.self).baseAddress)
      stream.avail_in = uInt(source.count)
      stream.next_out = destination.assumingMemoryBound(to: Bytef.self)
      stream.avail_out = uInt(size)
      return inflate(&stream, Z_FINISH)
    }
    guard status == Z_STREAM_END else {
      free(destination)
      return nil
    }
    return InflatedBytes(pointer: destination, count: size)
  }
}
