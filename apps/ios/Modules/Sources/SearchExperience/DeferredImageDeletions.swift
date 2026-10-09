import Foundation
import OSLog

final class DeferredImageDeletions {
  static let longestWait: TimeInterval = 30 * 24 * 60 * 60
  private static let mediaIDLength = 64

  private let fileURL: URL
  private let keepCopy: @Sendable (URL) throws -> Void
  private let now: @Sendable () -> Date
  private var isUnavailable = false
  private let logger = Logger(
    subsystem: Bundle.main.bundleIdentifier ?? "com.zenbujapanese.dictionary",
    category: "MediaLibrary")

  init(
    fileURL: URL, keepCopy: @escaping @Sendable (URL) throws -> Void,
    now: @escaping @Sendable () -> Date
  ) {
    self.fileURL = fileURL
    self.keepCopy = keepCopy
    self.now = now
  }

  func add(_ mediaID: String) {
    guard var list = load() else { return keepsImage(of: mediaID) }
    guard list[mediaID] == nil else { return }
    list[mediaID] = now()
    if !save(list) { keepsImage(of: mediaID) }
  }

  func remove(_ mediaID: String) {
    guard var list = load(), list.removeValue(forKey: mediaID) != nil else { return }
    save(list)
  }

  func load() -> [String: Date]? {
    guard !isUnavailable else { return nil }
    let data: Data
    do {
      data = try Data(contentsOf: fileURL)
    } catch CocoaError.fileReadNoSuchFile {
      return [:]
    } catch {
      return unavailable("Couldn't read the deferred image deletions")
    }
    if let list = try? JSONDecoder.localStore.decode([String: Date].self, from: data) {
      let mediaIDs = list.filter { Self.isMediaID($0.key) }
      guard mediaIDs.count < list.count else { return list }
      return save(mediaIDs) ? mediaIDs : nil
    }
    guard (try? keepCopy(fileURL)) != nil else {
      return unavailable("Couldn't keep aside damaged deferred image deletions")
    }
    let deferredAt = now()
    let recovered = Dictionary(uniqueKeysWithValues: Self.mediaIDs(in: data).map { ($0, deferredAt) })
    return save(recovered) ? recovered : nil
  }

  @discardableResult
  func save(_ list: [String: Date]) -> Bool {
    guard !isUnavailable else { return false }
    do {
      if list.isEmpty {
        try removeFile()
      } else {
        try JSONEncoder.localStore.encode(list).write(to: fileURL, options: .atomic)
      }
      return true
    } catch {
      _ = unavailable("Couldn't save the deferred image deletions")
      return false
    }
  }

  static func mediaIDs(in data: Data) -> Set<String> {
    Set(
      data.split { !isLowercaseHexDigit($0) }
        .filter { $0.count == mediaIDLength }
        .map { String(decoding: $0, as: UTF8.self) })
  }

  private static func isMediaID(_ name: String) -> Bool {
    name.utf8.count == mediaIDLength && name.utf8.allSatisfy(isLowercaseHexDigit)
  }

  private static func isLowercaseHexDigit(_ byte: UInt8) -> Bool {
    (UInt8(ascii: "0")...UInt8(ascii: "9")).contains(byte)
      || (UInt8(ascii: "a")...UInt8(ascii: "f")).contains(byte)
  }

  private func removeFile() throws {
    do {
      try FileManager.default.removeItem(at: fileURL)
    } catch CocoaError.fileNoSuchFile {
      return
    }
  }

  private func keepsImage(of mediaID: String) {
    logger.error(
      "Kept the image of deleted photo \(mediaID, privacy: .public): couldn't record it to delete later"
    )
  }

  private func unavailable(_ message: String) -> [String: Date]? {
    isUnavailable = true
    logger.error("\(message, privacy: .public); none are recorded or retried until the next launch")
    return nil
  }
}
