import Foundation
import OSLog

/// Why a store's saved file can't be changed. Changes are then ignored so none are shown that
/// wouldn't survive a relaunch.
enum LocalFileReadOnlyReason: Sendable {
  /// The file was saved by a newer version, and saving over it could lose its data.
  case newerVersion
  /// The file couldn't be read in full, and no copy of it could be kept aside.
  case couldNotKeepCopy
}

/// One versioned JSON file on the device that a store loads once and rewrites in full.
///
/// A file this version can't read in full is copied aside before it is replaced, and a file from
/// a newer version is never written over.
actor LocalJSONFile {
  enum Contents {
    case missing
    /// Saved by a newer version. Records may still decode, but the file must not be written.
    case newerVersion(Data)
    case current(Data)
  }

  /// Reads only the version, so a newer file is recognized even if its layout changed. A version
  /// that isn't a whole number this version knows counts as newer.
  private struct VersionProbe: Decodable {
    let version: Int?

    private enum CodingKeys: String, CodingKey { case version }

    init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      guard container.contains(.version), try !container.decodeNil(forKey: .version) else {
        version = nil
        return
      }
      version = (try? container.decode(Int.self, forKey: .version)) ?? .max
    }
  }

  private static let backupsKept = 3
  private let fileURL: URL
  private let currentVersion: Int
  private let description: String
  private let logger: Logger
  private var backupPrefix: String {
    "\(fileURL.deletingPathExtension().lastPathComponent).unreadable-"
  }

  /// - Parameter description: What the file holds, such as "known words", for log messages.
  init(fileURL: URL, currentVersion: Int, description: String, logCategory: String) {
    self.fileURL = fileURL
    self.currentVersion = currentVersion
    self.description = description
    logger = Logger(
      subsystem: Bundle.main.bundleIdentifier ?? "com.zenbujapanese.dictionary",
      category: logCategory)
  }

  func read() -> Contents {
    guard let data = try? Data(contentsOf: fileURL) else { return .missing }
    let version = (try? JSONDecoder().decode(VersionProbe.self, from: data))?.version
    guard let version, version > currentVersion else { return .current(data) }
    logger.error("The \(self.description) file is from a newer version; not saving over it")
    return .newerVersion(data)
  }

  /// Returns whether the value reached the disk.
  func write(_ data: Data) -> Bool {
    do {
      try FileManager.default.createDirectory(
        at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
      try data.write(to: fileURL, options: .atomic)
      return true
    } catch {
      logger.error("Couldn't save \(self.description): \(error.localizedDescription)")
      return false
    }
  }

  /// Copies an unreadable file beside it and returns whether the copy exists. Only the newest few
  /// copies are kept.
  func keepUnreadableCopy() -> Bool {
    let stamp = Int(Date().timeIntervalSince1970 * 1000)
    let suffix = UUID().uuidString.prefix(8)
    let directory = fileURL.deletingLastPathComponent()
    let backup = directory.appending(path: "\(backupPrefix)\(stamp)-\(suffix).json")
    do {
      try FileManager.default.copyItem(at: fileURL, to: backup)
      logger.error("Kept an unreadable \(self.description) file at \(backup.lastPathComponent)")
      pruneBackups(in: directory)
      return true
    } catch {
      logger.error(
        "Couldn't keep an unreadable \(self.description) file: \(error.localizedDescription)")
      return false
    }
  }

  /// Names start with a millisecond timestamp, so name order is age order.
  private func pruneBackups(in directory: URL) {
    let fileManager = FileManager.default
    guard let names = try? fileManager.contentsOfDirectory(atPath: directory.path) else { return }
    let backups = names.filter { $0.hasPrefix(backupPrefix) }.sorted()
    for name in backups.dropLast(Self.backupsKept) {
      try? fileManager.removeItem(at: directory.appending(path: name))
    }
  }
}

/// Runs a store's load and then its writes one after another, so a write never races the load or
/// an earlier write.
@MainActor
final class LocalFileWriteQueue {
  private var lastTask: Task<Void, Never>?
  private var writeQueued = false
  /// True when the last write failed.
  private(set) var hasUnsavedChanges = false

  /// Starts the load. Every later write waits for it.
  func load(_ load: @escaping @MainActor () async -> Void) {
    lastTask = Task { await load() }
  }

  /// Writes after the load and any earlier write. `write` runs then, so it should take its
  /// snapshot at that point; a write already waiting to start covers later changes.
  func save(_ write: @escaping @MainActor () async -> Bool) {
    guard !writeQueued else { return }
    writeQueued = true
    let previous = lastTask
    lastTask = Task {
      await previous?.value
      writeQueued = false
      hasUnsavedChanges = !(await write())
    }
  }

  /// Waits until the load and every write so far have finished.
  func flush() async {
    // Loops because the load can queue a rewrite after it finishes.
    var finished: Task<Void, Never>?
    while let task = lastTask, task != finished {
      await task.value
      finished = task
    }
  }
}

extension JSONEncoder {
  /// Encodes dates as milliseconds since 1970, the format every local store file uses.
  static var localStore: JSONEncoder {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .millisecondsSince1970
    return encoder
  }
}

extension JSONDecoder {
  static var localStore: JSONDecoder {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .millisecondsSince1970
    return decoder
  }
}

/// Decodes one element of an array, or nil when it can't be read, so one unreadable record
/// doesn't discard the rest.
struct LossyDecodable<Value: Decodable>: Decodable {
  let value: Value?

  init(from decoder: Decoder) throws {
    value = try? Value(from: decoder)
  }
}
