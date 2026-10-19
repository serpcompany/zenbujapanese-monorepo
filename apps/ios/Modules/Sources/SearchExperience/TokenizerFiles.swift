import Foundation

enum TokenizerFiles {
  static func mapped(unpackingInto folder: URL) -> @Sendable (String) -> InflatedBytes? {
    { file in
      let filename = "\(file).dat.gz"
      guard TokenizerDictionary.files.contains(filename),
        let packed = TokenizerDictionary.resourceURL(filename).flatMap({
          try? Data(contentsOf: $0, options: .alwaysMapped)
        }),
        let trailer = Gunzip.trailer(of: packed)
      else { return nil }
      let unpacked = folder.appending(
        path: "\(file)-\(String(trailer.checksum, radix: 16))-\(trailer.size).dat")
      guard size(of: unpacked) == trailer.size || unpack(packed, to: unpacked, named: file)
      else { return nil }
      return map(unpacked, size: trailer.size)
    }
  }

  static func size(of file: URL) -> Int? {
    (try? file.resourceValues(forKeys: [.fileSizeKey]))?.fileSize
  }

  private static func unpack(_ packed: Data, to unpacked: URL, named file: String) -> Bool {
    let folder = unpacked.deletingLastPathComponent()
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let partial = folder.appending(path: "\(UUID().uuidString).partial")
    let descriptor = open(partial.path, O_CREAT | O_EXCL | O_WRONLY, 0o600)
    guard descriptor >= 0 else { return false }
    let whole = Gunzip.unpack(packed, to: descriptor)
    close(descriptor)
    guard whole, rename(partial.path, unpacked.path) == 0 else {
      try? FileManager.default.removeItem(at: partial)
      return false
    }
    removeEarlierVersions(of: file, keeping: unpacked)
    return true
  }

  private static func removeEarlierVersions(of file: String, keeping current: URL) {
    let folder = current.deletingLastPathComponent()
    let names = (try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? []
    for name in names
    where (name.hasPrefix("\(file)-") || name.hasSuffix(".partial")) && name != current.lastPathComponent
    {
      try? FileManager.default.removeItem(at: folder.appending(path: name))
    }
  }

  private static func map(_ file: URL, size: Int) -> InflatedBytes? {
    let descriptor = open(file.path, O_RDONLY)
    guard descriptor >= 0 else { return nil }
    defer { close(descriptor) }
    guard
      let pointer = mmap(nil, size, PROT_READ | PROT_WRITE, MAP_PRIVATE, descriptor, 0),
      pointer != MAP_FAILED
    else { return nil }
    return InflatedBytes(pointer: pointer, count: size, isMapped: true)
  }
}
