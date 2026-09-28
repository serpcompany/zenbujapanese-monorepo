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
      let (loaded, needsRewrite) = await writer.load()
      records = loaded
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
    guard isLoaded, self.status(id) != status else { return }
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
    await lastWrite?.value
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

  /// Decodes each record on its own, so one unreadable record doesn't discard the rest.
  private struct LoadedFile: Decodable {
    let version: Int
    let records: [WordKnowledgeRecord?]

    private enum CodingKeys: String, CodingKey { case version, records }
    private struct LossyRecord: Decodable {
      let record: WordKnowledgeRecord?
      init(from decoder: Decoder) throws {
        record = try? WordKnowledgeRecord(from: decoder)
      }
    }

    init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      version = try container.decodeIfPresent(Int.self, forKey: .version) ?? 1
      records = try container.decode([LossyRecord].self, forKey: .records).map(\.record)
    }
  }

  private static let logger = Logger(subsystem: "com.zenbujapanese", category: "WordKnowledge")
  private let fileURL: URL
  /// Set when saving could lose data this version can't read: a file from a newer version, or
  /// an unreadable file that couldn't be kept aside. Changes then stay in memory only.
  private var isReadOnly = false

  init(fileURL: URL) {
    self.fileURL = fileURL
  }

  /// A missing file loads as no records. A file that can't be read in full is kept beside it,
  /// and `needsRewrite` asks for the readable records to replace it once that copy exists.
  func load() -> (records: [String: WordKnowledgeRecord], needsRewrite: Bool) {
    guard let data = try? Data(contentsOf: fileURL) else { return ([:], false) }
    guard let stored = try? JSONDecoder.wordKnowledge.decode(LoadedFile.self, from: data) else {
      isReadOnly = !preserveUnreadableFile()
      return ([:], !isReadOnly)
    }
    let records = stored.records.compactMap(\.self)
    let loaded = Dictionary(records.map { ($0.entryID, $0) }) { _, latest in latest }
    if stored.version > StoredFile.currentVersion {
      isReadOnly = true
      Self.logger.error("Known words file is version \(stored.version); not saving over it")
      return (loaded, false)
    }
    guard records.count != stored.records.count else { return (loaded, false) }
    isReadOnly = !preserveUnreadableFile()
    return (loaded, !isReadOnly)
  }

  /// Returns whether the records reached the disk.
  func write(_ records: [WordKnowledgeRecord]) -> Bool {
    guard !isReadOnly else { return true }
    let sorted = records.sorted { $0.entryID < $1.entryID }
    do {
      let data = try JSONEncoder.wordKnowledge.encode(StoredFile(records: sorted))
      try FileManager.default.createDirectory(
        at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
      try data.write(to: fileURL, options: .atomic)
      return true
    } catch {
      Self.logger.error("Couldn't save known words: \(error.localizedDescription)")
      return false
    }
  }

  /// Returns whether the copy exists.
  private func preserveUnreadableFile() -> Bool {
    let stamp = Int(Date().timeIntervalSince1970)
    let backup = fileURL.deletingLastPathComponent()
      .appending(path: "word-knowledge.unreadable-\(stamp).json")
    do {
      try FileManager.default.copyItem(at: fileURL, to: backup)
      Self.logger.error("Kept an unreadable known-words file at \(backup.lastPathComponent)")
      return true
    } catch {
      Self.logger.error("Couldn't keep an unreadable known-words file: \(error.localizedDescription)")
      return false
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
