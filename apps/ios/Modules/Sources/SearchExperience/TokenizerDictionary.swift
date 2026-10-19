import Foundation

enum TokenizerDictionary {
  static let files = [
    "base.dat.gz", "cc.dat.gz", "check.dat.gz", "tid.dat.gz", "tid_map.dat.gz",
    "tid_pos.dat.gz", "unk.dat.gz", "unk_char.dat.gz", "unk_invoke.dat.gz", "unk_map.dat.gz",
    "unk_pos.dat.gz",
  ]

  static func unpacked(_ file: String) -> InflatedBytes? {
    let filename = "\(file).dat.gz"
    guard files.contains(filename),
      let url = resourceURL(filename),
      let packed = try? Data(contentsOf: url)
    else { return nil }
    return Gunzip.inflated(packed)
  }

  static func resourceURL(_ filename: String) -> URL? {
    let name = (filename as NSString).deletingPathExtension
    let ext = (filename as NSString).pathExtension
    return BundledData.bundle.url(
      forResource: name,
      withExtension: ext.isEmpty ? nil : ext,
      subdirectory: "Kuromoji"
    ) ?? BundledData.bundle.url(forResource: name, withExtension: ext.isEmpty ? nil : ext)
  }
}
