import Foundation
import OSLog

enum LocalFileReadOnlyReason: Sendable {
  case newerVersion
  case couldNotKeepCopy
  case couldNotRead
}

actor LocalJSONFile {
  enum Contents {
    case missing
    case unreadable
    case newerVersion(Data)
    case current(Data)
  }

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

  private let fileURL: URL
  private let currentVersion: Int
  private let description: String
  private let logger: Logger

  init(fileURL: URL, currentVersion: Int, description: String, logCategory: String) {
    self.fileURL = fileURL
    self.currentVersion = currentVersion
    self.description = description
    logger = Logger(
      subsystem: Bundle.main.bundleIdentifier ?? "com.zenbujapanese.dictionary",
      category: logCategory)
  }

  func read() -> Contents {
    let data: Data
    do {
      data = try Data(contentsOf: fileURL)
    } catch CocoaError.fileReadNoSuchFile {
      return .missing
    } catch {
      logger.error("Couldn't read the \(self.description) file: \(error.localizedDescription)")
      return .unreadable
    }
    let version = (try? JSONDecoder().decode(VersionProbe.self, from: data))?.version
    guard let version, version > currentVersion else { return .current(data) }
    logger.error("The \(self.description) file is from a newer version; not saving over it")
    return .newerVersion(data)
  }

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

  func keepUnreadableCopy() -> Bool {
    do {
      try UnreadableCopy.keep(file: fileURL)
      return true
    } catch {
      logger.error(
        "Couldn't keep an unreadable \(self.description) file: \(error.localizedDescription)")
      return false
    }
  }
}

@MainActor
final class LocalFileWriteQueue {
  private var lastTask: Task<Void, Never>?
  private var writeQueued = false
  private(set) var hasUnsavedChanges = false

  func load(_ load: @escaping @MainActor () async -> Void) {
    lastTask = Task { await load() }
  }

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

  func flush() async {
    var finished: Task<Void, Never>?
    while let task = lastTask, task != finished {
      await task.value
      finished = task
    }
  }
}

@MainActor
protocol LocalFileStore: AnyObject {
  var writes: LocalFileWriteQueue { get }
  func persist()
}

extension LocalFileStore {
  func saveIfNeeded() {
    if writes.hasUnsavedChanges { persist() }
  }

  func flush() async {
    await writes.flush()
  }
}

extension JSONEncoder {
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

struct LossyDecodable<Value: Decodable>: Decodable {
  let value: Value?

  init(from decoder: Decoder) throws {
    value = try? Value(from: decoder)
  }
}
