import Foundation
import Observation
import OSLog

enum WordKnowledgeStatus: Codable, Hashable, Sendable {
  case known
  case unknown
  /// A status written by a newer version. It reads as unknown and is saved back unchanged.
  case unrecognized(String)

  init(from decoder: Decoder) throws {
    let value = try decoder.singleValueContainer().decode(String.self)
    switch value {
    case "known": self = .known
    case "unknown": self = .unknown
    default: self = .unrecognized(value)
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .known: try container.encode("known")
    case .unknown: try container.encode("unknown")
    case .unrecognized(let value): try container.encode(value)
    }
  }
}

/// Why known words can't be saved. Changes are then ignored so none are shown that wouldn't
/// survive a relaunch.
enum WordKnowledgeReadOnlyReason: Sendable {
  /// The file was saved by a newer version, and saving over it could lose its data.
  case newerVersion
  /// The file couldn't be read in full, and no copy of it could be kept aside.
  case couldNotKeepCopy
}

/// One learner judgement about a dictionary word, keyed by its stable Language Reference ID.
/// Marking a word unknown keeps its record, so a later sync can tell a removal from no status.
struct WordKnowledgeRecord: Codable, Hashable, Identifiable, Sendable {
  let entryID: String
  let headword: String
  let reading: String
  var status: WordKnowledgeStatus
  var updatedAt: Date

  var id: String { entryID }
  var languageReferenceID: LanguageReferenceID { LanguageReferenceID(rawValue: entryID) }
}

/// Which words the learner knows. A word without a record is unknown.
///
/// Records are held in memory for fast lookups and saved as one JSON file on the device. The
/// file loads off the main actor.
@MainActor
@Observable
final class WordKnowledge {
  static let shared = WordKnowledge()

  /// False until the file has loaded. Until then every word reads as unknown and changes are
  /// ignored, so callers showing or acting on known state should wait for it.
  private(set) var isLoaded = false
  /// Set when changes can't be saved; they are then ignored.
  private(set) var readOnlyReason: WordKnowledgeReadOnlyReason?
  var isReadOnly: Bool { readOnlyReason != nil }
  private(set) var records: [String: WordKnowledgeRecord] = [:]
  /// Known words, most recently marked first.
  private(set) var knownRecords: [WordKnowledgeRecord] = []
  @ObservationIgnored private let writer: WordKnowledgeWriter
  @ObservationIgnored private var lastWrite: Task<Void, Never>?
  @ObservationIgnored private var hasUnsavedChanges = false
  @ObservationIgnored private var writeQueued = false

  init(fileURL: URL = WordKnowledge.defaultFileURL) {
    let writer = WordKnowledgeWriter(fileURL: fileURL)
    self.writer = writer
    lastWrite = Task {
      let (loaded, needsRewrite, readOnlyReason) = await writer.load()
      records = loaded
      self.readOnlyReason = readOnlyReason
      knownRecords = records.values
        .filter { $0.status == .known }
        .sorted { $0.updatedAt > $1.updatedAt }
      isLoaded = true
      // Replaces a partly unreadable file, already kept aside, so it isn't copied every launch.
      if needsRewrite { persist() }
    }
  }

  func status(_ id: LanguageReferenceID) -> WordKnowledgeStatus {
    records[id.rawValue]?.status ?? .unknown
  }

  func isKnown(_ id: LanguageReferenceID) -> Bool {
    status(id) == .known
  }

  var knownCount: Int { knownRecords.count }

  func setStatus(_ status: WordKnowledgeStatus, for entry: DictionaryEntry) {
    setStatus(status, id: entry.id, headword: entry.headword, reading: entry.reading)
  }

  func setStatus(_ status: WordKnowledgeStatus, for record: WordKnowledgeRecord) {
    setStatus(
      status, id: record.languageReferenceID, headword: record.headword, reading: record.reading)
  }

  func setStatus(
    _ status: WordKnowledgeStatus, id: LanguageReferenceID, headword: String, reading: String
  ) {
    guard isLoaded, !isReadOnly, self.status(id) != status else { return }
    let record = WordKnowledgeRecord(
      entryID: id.rawValue,
      headword: headword,
      reading: reading,
      status: status,
      updatedAt: Date()
    )
    records[id.rawValue] = record
    knownRecords.removeAll { $0.entryID == id.rawValue }
    if status == .known { knownRecords.insert(record, at: 0) }
    persist()
  }

  func toggleKnown(_ entry: DictionaryEntry) {
    setStatus(isKnown(entry.id) ? .unknown : .known, for: entry)
  }

  /// Tries again to save changes whose last write failed.
  func saveIfNeeded() {
    if hasUnsavedChanges { persist() }
  }

  /// Waits until the file has loaded and every change so far has been written.
  func flush() async {
    // Loops because the load can queue a rewrite after it finishes.
    var finished: Task<Void, Never>?
    while let task = lastWrite, task != finished {
      await task.value
      finished = task
    }
  }

  /// Writes after the load and any earlier write, taking the snapshot then so the file always
  /// holds loaded records too. A write already waiting to start covers later changes.
  private func persist() {
    guard !writeQueued else { return }
    writeQueued = true
    let previous = lastWrite
    let writer = writer
    lastWrite = Task {
      await previous?.value
      writeQueued = false
      hasUnsavedChanges = !(await writer.write(Array(records.values)))
    }
  }

  nonisolated static let defaultFileURL = FileManager.default.urls(
    for: .applicationSupportDirectory,
    in: .userDomainMask
  )[0]
  .appending(path: "Zenbu Japanese", directoryHint: .isDirectory)
  .appending(path: "word-knowledge.json")
}

private actor WordKnowledgeWriter {
  private struct StoredFile: Codable {
    static let currentVersion = 1
    var version = currentVersion
    var records: [WordKnowledgeRecord]
  }

  /// Reads only the version, so a newer file is recognized even if its layout changed. A version
  /// that isn't a whole number this version knows counts as newer.
  private struct VersionProbe: Decodable {
    let isNewer: Bool

    private enum CodingKeys: String, CodingKey { case version }

    init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      guard container.contains(.version), try !container.decodeNil(forKey: .version) else {
        isNewer = false
        return
      }
      let version = try? container.decode(Int.self, forKey: .version)
      isNewer = (version ?? .max) > StoredFile.currentVersion
    }
  }

  /// Decodes each record on its own, so one unreadable record doesn't discard the rest.
  private struct LoadedFile: Decodable {
    let records: [WordKnowledgeRecord?]

    private enum CodingKeys: String, CodingKey { case records }
    private struct LossyRecord: Decodable {
      let record: WordKnowledgeRecord?
      init(from decoder: Decoder) throws {
        record = try? WordKnowledgeRecord(from: decoder)
      }
    }

    init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      records = try container.decode([LossyRecord].self, forKey: .records).map(\.record)
    }
  }

  private static let logger = Logger(
    subsystem: Bundle.main.bundleIdentifier ?? "com.zenbujapanese.dictionary",
    category: "WordKnowledge")
  private let fileURL: URL

  init(fileURL: URL) {
    self.fileURL = fileURL
  }

  /// A missing file loads as no records. A file that can't be read in full is kept beside it,
  /// and `needsRewrite` asks for the readable records to replace it once that copy exists.
  func load() -> (
    records: [String: WordKnowledgeRecord], needsRewrite: Bool,
    readOnlyReason: WordKnowledgeReadOnlyReason?
  ) {
    guard let data = try? Data(contentsOf: fileURL) else { return ([:], false, nil) }
    let decoder = JSONDecoder.wordKnowledge
    if (try? decoder.decode(VersionProbe.self, from: data))?.isNewer == true {
      Self.logger.error("Known words file is from a newer version; not saving over it")
      let records = (try? decoder.decode(LoadedFile.self, from: data))?.records ?? []
      return (Self.byEntryID(records.compactMap(\.self)), false, .newerVersion)
    }
    guard let stored = try? decoder.decode(LoadedFile.self, from: data) else {
      return preserveUnreadableFile() ? ([:], true, nil) : ([:], false, .couldNotKeepCopy)
    }
    let records = stored.records.compactMap(\.self)
    let loaded = Self.byEntryID(records)
    guard records.count != stored.records.count else { return (loaded, false, nil) }
    return preserveUnreadableFile() ? (loaded, true, nil) : (loaded, false, .couldNotKeepCopy)
  }

  private static func byEntryID(_ records: [WordKnowledgeRecord]) -> [String: WordKnowledgeRecord] {
    Dictionary(records.map { ($0.entryID, $0) }) { _, latest in latest }
  }

  /// Returns whether the records reached the disk.
  func write(_ records: [WordKnowledgeRecord]) -> Bool {
    do {
      let data = try JSONEncoder.wordKnowledge.encode(StoredFile(records: records))
      try FileManager.default.createDirectory(
        at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
      try data.write(to: fileURL, options: .atomic)
      return true
    } catch {
      Self.logger.error("Couldn't save known words: \(error.localizedDescription)")
      return false
    }
  }

  private static let backupPrefix = "word-knowledge.unreadable-"
  private static let backupsKept = 3

  /// Returns whether the copy exists. Only the newest few copies are kept.
  private func preserveUnreadableFile() -> Bool {
    let stamp = Int(Date().timeIntervalSince1970 * 1000)
    let suffix = UUID().uuidString.prefix(8)
    let directory = fileURL.deletingLastPathComponent()
    let backup = directory.appending(path: "\(Self.backupPrefix)\(stamp)-\(suffix).json")
    do {
      try FileManager.default.copyItem(at: fileURL, to: backup)
      Self.logger.error("Kept an unreadable known-words file at \(backup.lastPathComponent)")
      pruneBackups(in: directory)
      return true
    } catch {
      Self.logger.error("Couldn't keep an unreadable known-words file: \(error.localizedDescription)")
      return false
    }
  }

  /// Names start with a millisecond timestamp, so name order is age order.
  private func pruneBackups(in directory: URL) {
    let fileManager = FileManager.default
    guard let names = try? fileManager.contentsOfDirectory(atPath: directory.path) else { return }
    let backups = names.filter { $0.hasPrefix(Self.backupPrefix) }.sorted()
    for name in backups.dropLast(Self.backupsKept) {
      try? fileManager.removeItem(at: directory.appending(path: name))
    }
  }
}

extension JSONEncoder {
  fileprivate static var wordKnowledge: JSONEncoder {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .millisecondsSince1970
    return encoder
  }
}

extension JSONDecoder {
  fileprivate static var wordKnowledge: JSONDecoder {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .millisecondsSince1970
    return decoder
  }
}
