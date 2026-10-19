import Foundation
import zlib

struct InflatedBytes {
  let pointer: UnsafeMutableRawPointer
  let count: Int
  var isMapped = false

  func release() {
    if isMapped {
      munmap(pointer, count)
    } else {
      free(pointer)
    }
  }
}

enum Gunzip {
  private static let smallestFile = 18
  private static let chunk = 1 << 20

  struct Trailer: Equatable {
    let checksum: UInt32
    let size: Int
  }

  static func inflated(_ gzip: Data) -> InflatedBytes? {
    guard let size = trailer(of: gzip)?.size, let destination = malloc(size) else { return nil }
    let status = inflating(gzip) { stream in
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

  static func trailer(of gzip: Data) -> Trailer? {
    guard gzip.count > smallestFile else { return nil }
    let littleEndian = { (bytes: Data) in bytes.reversed().reduce(0) { $0 << 8 | Int($1) } }
    let size = littleEndian(gzip.suffix(4))
    guard size > 0 else { return nil }
    return Trailer(checksum: UInt32(littleEndian(gzip.suffix(8).prefix(4))), size: size)
  }

  static func unpack(_ gzip: Data, to file: Int32) -> Bool {
    guard let expected = trailer(of: gzip) else { return false }
    var buffer = [UInt8](repeating: 0, count: chunk)
    var written = 0
    let status = inflating(gzip) { stream in
      var status = Z_OK
      while status == Z_OK {
        status = buffer.withUnsafeMutableBytes { output in
          stream.next_out = output.bindMemory(to: Bytef.self).baseAddress
          stream.avail_out = uInt(output.count)
          let status = inflate(&stream, Z_NO_FLUSH)
          let produced = output.count - Int(stream.avail_out)
          guard produced > 0 else { return status }
          guard written + produced <= expected.size,
            pwrite(file, output.baseAddress, produced, off_t(written)) == produced
          else { return Z_DATA_ERROR }
          written += produced
          return status
        }
      }
      return status
    }
    return status == Z_STREAM_END && written == expected.size
  }

  private static func inflating(_ gzip: Data, _ run: (inout z_stream) -> Int32) -> Int32 {
    var stream = z_stream()
    guard
      inflateInit2_(
        &stream, 16 + MAX_WBITS, ZLIB_VERSION, Int32(MemoryLayout<z_stream>.size)) == Z_OK
    else { return Z_STREAM_ERROR }
    defer { inflateEnd(&stream) }
    return gzip.withUnsafeBytes { source in
      stream.next_in = UnsafeMutablePointer(
        mutating: source.bindMemory(to: Bytef.self).baseAddress)
      stream.avail_in = uInt(source.count)
      return run(&stream)
    }
  }
}
