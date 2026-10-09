import Foundation
import OSLog

enum UnreadableCopy {
  private static let earlierKept = 2
  private static let logger = Logger(
    subsystem: Bundle.main.bundleIdentifier ?? "com.zenbujapanese.dictionary", category: "UnreadableCopy")

  @discardableResult
  static func keep(file fileURL: URL) throws -> URL {
    let data = try Data(contentsOf: fileURL)
    let earlier = copies(of: fileURL)
    if let same = earlier.first(where: { (try? Data(contentsOf: $0)) == data }) { return same }
    let name = "\(stamped(prefix(of: fileURL))).\(fileURL.pathExtension)"
    let copy = fileURL.deletingLastPathComponent().appending(path: name)
    try FileManager.default.copyItem(at: fileURL, to: copy)
    for url in outdated(earlier, named: \.lastPathComponent) {
      try? FileManager.default.removeItem(at: url)
    }
    logger.error("Kept an unreadable file at \(name, privacy: .public)")
    return copy
  }

  static func keep(_ key: String, in defaults: UserDefaults) {
    guard let value = defaults.object(forKey: key) else { return }
    let prefix = prefix(of: key)
    let earlier = defaults.dictionaryRepresentation().keys.filter { $0.hasPrefix(prefix) }
    let alreadyKept = earlier.contains { name in
      (defaults.object(forKey: name) as? NSObject)?.isEqual(value) == true
    }
    if !alreadyKept {
      let copyKey = stamped(prefix)
      defaults.set(value, forKey: copyKey)
      for name in outdated(earlier, named: \.self) {
        defaults.removeObject(forKey: name)
      }
      logger.error("Kept an unreadable value at \(copyKey, privacy: .public)")
    }
    defaults.removeObject(forKey: key)
  }

  static func copies(of fileURL: URL) -> [URL] {
    let directory = fileURL.deletingLastPathComponent()
    let prefix = prefix(of: fileURL)
    let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
    return names.filter { $0.hasPrefix(prefix) }.map { directory.appending(path: $0) }
  }

  private static func prefix(of fileURL: URL) -> String {
    prefix(of: fileURL.deletingPathExtension().lastPathComponent)
  }

  private static func prefix(of name: String) -> String { "\(name).unreadable-" }

  private static func stamped(_ prefix: String) -> String {
    "\(prefix)\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(8))"
  }

  private static func outdated<Copy>(_ earlier: [Copy], named name: (Copy) -> String) -> [Copy] {
    Array(earlier.sorted { name($0) < name($1) }.dropLast(earlierKept))
  }
}
