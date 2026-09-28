import Foundation
import Observation

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

/// One learner judgement about a dictionary word or kanji, keyed by `SavedItem.storedID`: a
/// word's stable Language Reference ID, or `kanji:` and the character.
/// Marking a word unknown keeps its record, so a later sync can tell a removal from no status.
struct WordKnowledgeRecord: Codable, Hashable, Identifiable, Sendable {
  let entryID: String
  let headword: String
  let reading: String
  var status: WordKnowledgeStatus
  var updatedAt: Date

  var id: String { entryID }
  /// The kanji this record is about, or nil for a word.
  var kanji: KanjiCharacter? { SavedItem.kanji(storedID: entryID) }
}

/// Which words and kanji the learner knows. A word without a record is unknown.
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
  private(set) var readOnlyReason: LocalFileReadOnlyReason?
  var isReadOnly: Bool { readOnlyReason != nil }
  private(set) var records: [String: WordKnowledgeRecord] = [:]
  /// Known words, most recently marked first.
  private(set) var knownRecords: [WordKnowledgeRecord] = []
  @ObservationIgnored private let writer: WordKnowledgeWriter
  @ObservationIgnored private let writes = LocalFileWriteQueue()

  init(fileURL: URL = WordKnowledge.defaultFileURL) {
    let writer = WordKnowledgeWriter(fileURL: fileURL)
    self.writer = writer
    writes.load { [self] in
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

  func isKnown(_ item: SavedItem) -> Bool {
    isKnown(storedID: item.storedID)
  }

  func isKnown(storedID: String) -> Bool {
    records[storedID]?.status == .known
  }

  var knownCount: Int { knownRecords.count }

  func setStatus(_ status: WordKnowledgeStatus, for entry: DictionaryEntry) {
    setStatus(status, id: entry.id, headword: entry.headword, reading: entry.reading)
  }

  func setStatus(_ status: WordKnowledgeStatus, for record: WordKnowledgeRecord) {
    setStatus(
      status, storedID: record.entryID, headword: record.headword, reading: record.reading)
  }

  func setStatus(
    _ status: WordKnowledgeStatus, id: LanguageReferenceID, headword: String, reading: String
  ) {
    setStatus(status, storedID: id.rawValue, headword: headword, reading: reading)
  }

  func toggleKnown(_ item: SavedItem) {
    setStatus(
      isKnown(item) ? .unknown : .known, storedID: item.storedID, headword: item.headword,
      reading: item.reading)
  }

  private func setStatus(
    _ status: WordKnowledgeStatus, storedID: String, headword: String, reading: String
  ) {
    guard isLoaded, !isReadOnly, (records[storedID]?.status ?? .unknown) != status else { return }
    let record = WordKnowledgeRecord(
      entryID: storedID,
      headword: headword,
      reading: reading,
      status: status,
      updatedAt: Date()
    )
    records[storedID] = record
    knownRecords.removeAll { $0.entryID == storedID }
    if status == .known { knownRecords.insert(record, at: 0) }
    persist()
  }

  /// Tries again to save changes whose last write failed.
  func saveIfNeeded() {
    if writes.hasUnsavedChanges { persist() }
  }

  /// Waits until the file has loaded and every change so far has been written.
  func flush() async {
    await writes.flush()
  }

  private func persist() {
    let writer = writer
    writes.save { [self] in await writer.write(Array(records.values)) }
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
    /// Version 2 adds kanji records, which a version 1 app would open as words; it opens a
    /// version 2 file read-only instead.
    static let currentVersion = 2
    var version = currentVersion
    var records: [WordKnowledgeRecord]
  }

  private struct LoadedFile: Decodable {
    let records: [LossyDecodable<WordKnowledgeRecord>]
  }

  private let file: LocalJSONFile

  init(fileURL: URL) {
    file = LocalJSONFile(
      fileURL: fileURL, currentVersion: StoredFile.currentVersion,
      description: "known words", logCategory: "WordKnowledge")
  }

  /// A missing file loads as no records. A file that can't be read in full is kept beside it,
  /// and `needsRewrite` asks for the readable records to replace it once that copy exists.
  func load() async -> (
    records: [String: WordKnowledgeRecord], needsRewrite: Bool,
    readOnlyReason: LocalFileReadOnlyReason?
  ) {
    let data: Data
    switch await file.read() {
    case .missing:
      return ([:], false, nil)
    case .unreadable:
      return ([:], false, .couldNotRead)
    case .newerVersion(let newer):
      let records = (try? JSONDecoder.localStore.decode(LoadedFile.self, from: newer))?.records
      return (Self.byEntryID(records?.compactMap(\.value) ?? []), false, .newerVersion)
    case .current(let current):
      data = current
    }
    guard let stored = try? JSONDecoder.localStore.decode(LoadedFile.self, from: data) else {
      return await file.keepUnreadableCopy() ? ([:], true, nil) : ([:], false, .couldNotKeepCopy)
    }
    let records = stored.records.compactMap(\.value)
    let loaded = Self.byEntryID(records)
    guard records.count != stored.records.count else { return (loaded, false, nil) }
    return await file.keepUnreadableCopy()
      ? (loaded, true, nil) : (loaded, false, .couldNotKeepCopy)
  }

  private static func byEntryID(_ records: [WordKnowledgeRecord]) -> [String: WordKnowledgeRecord] {
    Dictionary(records.map { ($0.entryID, $0) }) { _, latest in latest }
  }

  /// Returns whether the records reached the disk.
  func write(_ records: [WordKnowledgeRecord]) async -> Bool {
    guard let data = try? JSONEncoder.localStore.encode(StoredFile(records: records)) else {
      return false
    }
    return await file.write(data)
  }
}
