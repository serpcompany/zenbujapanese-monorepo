import Foundation
import Observation

enum WordKnowledgeStatus: Codable, Hashable, Sendable {
  case known
  case unknown
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

struct WordKnowledgeRecord: Codable, Hashable, Identifiable, Sendable {
  let entryID: String
  let headword: String
  let reading: String
  var status: WordKnowledgeStatus
  var updatedAt: Date

  var id: String { entryID }
  var kanji: KanjiCharacter? { SavedItem.kanji(storedID: entryID) }
}

@MainActor
@Observable
final class WordKnowledge {
  static let shared = WordKnowledge()

  private(set) var isLoaded = false
  private(set) var readOnlyReason: LocalFileReadOnlyReason?
  var isReadOnly: Bool { readOnlyReason != nil }
  private(set) var records: [String: WordKnowledgeRecord] = [:]
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

  func saveIfNeeded() {
    if writes.hasUnsavedChanges { persist() }
  }

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

  func write(_ records: [WordKnowledgeRecord]) async -> Bool {
    guard let data = try? JSONEncoder.localStore.encode(StoredFile(records: records)) else {
      return false
    }
    return await file.write(data)
  }
}
