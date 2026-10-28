import Foundation
import Observation

enum WordKnowledgeStatus: Codable, Hashable, Sendable {
  case unknown
  case learning
  case known
  case unrecognized(String)

  static let chosen: [WordKnowledgeStatus] = [.unknown, .learning, .known]
  static let listed: [WordKnowledgeStatus] = [.known, .learning]

  init(stored value: String) {
    self = Self.chosen.first { $0.stored == value } ?? .unrecognized(value)
  }

  var stored: String {
    switch self {
    case .unknown: "unknown"
    case .learning: "learning"
    case .known: "known"
    case .unrecognized(let value): value
    }
  }

  init(from decoder: Decoder) throws {
    self.init(stored: try decoder.singleValueContainer().decode(String.self))
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(stored)
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

  var item: SavedItem {
    kanji.map { .kanji($0, reading: reading) }
      ?? SavedItem(
        kind: .word(LanguageReferenceID(rawValue: entryID)), headword: headword, reading: reading)
  }
}

@MainActor
@Observable
final class WordKnowledge: LocalFileStore {
  static let shared = WordKnowledge(
    sharedCopy: SharedContainer.copy(named: SharedContainer.wordKnowledge))

  private(set) var isLoaded = false
  private(set) var readOnlyReason: LocalFileReadOnlyReason?
  var isReadOnly: Bool { readOnlyReason != nil }
  private(set) var records: [String: WordKnowledgeRecord] = [:]
  private var listed: [WordKnowledgeStatus: [WordKnowledgeRecord]] = [:]
  @ObservationIgnored private let writer: WordKnowledgeWriter
  @ObservationIgnored let writes = LocalFileWriteQueue()
  @ObservationIgnored var changeObserver: ((SavedItemChange) -> Void)?
  @ObservationIgnored var progressObserver: ((WordKnowledgeEvent) -> Void)?
  @ObservationIgnored var now: () -> Date = Date.init
  @ObservationIgnored private var heldProgress: SyncedProgress?
  var canChange: Bool { isLoaded && !isReadOnly }

  init(fileURL: URL = WordKnowledge.defaultFileURL, sharedCopy: URL? = nil) {
    let writer = WordKnowledgeWriter(fileURL: fileURL, sharedCopy: sharedCopy)
    self.writer = writer
    writes.load { [self] in
      let (loaded, needsRewrite, readOnlyReason) = await writer.load()
      records = loaded
      self.readOnlyReason = readOnlyReason
      listed = Dictionary(
        grouping: records.values.filter { WordKnowledgeStatus.listed.contains($0.status) },
        by: \.status
      ).mapValues { $0.sorted { $0.updatedAt > $1.updatedAt } }
      isLoaded = true
      if needsRewrite { persist() }
    }
  }

  func status(_ id: LanguageReferenceID) -> WordKnowledgeStatus {
    status(storedID: id.rawValue)
  }

  func status(_ item: SavedItem) -> WordKnowledgeStatus {
    status(storedID: item.storedID)
  }

  func status(storedID: String) -> WordKnowledgeStatus {
    records[storedID]?.status ?? .unknown
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

  func marked(_ status: WordKnowledgeStatus) -> [WordKnowledgeRecord] {
    listed[status] ?? []
  }

  func ids(_ status: WordKnowledgeStatus, among entries: [DictionaryEntry]) -> [String] {
    entries.map(\.id).filter { self.status($0) == status }.map(\.rawValue)
  }

  var knownRecords: [WordKnowledgeRecord] { marked(.known) }

  var totals: ProgressTotals {
    ProgressTotals(known: marked(.known).count, learning: marked(.learning).count)
  }

  func setStatus(_ status: WordKnowledgeStatus, for entry: DictionaryEntry) {
    setStatus(status, id: entry.id, headword: entry.headword, reading: entry.reading)
  }

  func setStatus(_ status: WordKnowledgeStatus, for record: WordKnowledgeRecord) {
    setStatus(
      status, storedID: record.entryID, headword: record.headword, reading: record.reading)
  }

  func setStatus(
    _ status: WordKnowledgeStatus, id: LanguageReferenceID, headword: String, reading: String,
    at time: Date? = nil
  ) {
    setStatus(status, storedID: id.rawValue, headword: headword, reading: reading, at: time)
  }

  func setStatus(_ status: WordKnowledgeStatus, for item: SavedItem) {
    setStatus(status, storedID: item.storedID, headword: item.headword, reading: item.reading)
  }

  private func setStatus(
    _ status: WordKnowledgeStatus, storedID: String, headword: String, reading: String,
    at time: Date? = nil
  ) {
    let previous = records[storedID]?.status ?? .unknown
    guard store(status, storedID: storedID, headword: headword, reading: reading) else { return }
    let change = KnownWordChange(
      storedID: storedID, headword: headword, reading: reading, status: status,
      changedAt: time ?? now())
    progressObserver?(.changed(change, previous: previous, totals: totals))
    changeObserver?(.known(change, previous: previous))
  }

  func applySynced(_ word: KnownWordChange) {
    let previous = status(storedID: word.storedID)
    guard store(word.status, storedID: word.storedID, headword: word.headword, reading: word.reading)
    else { return }
    var progress = heldProgress ?? SyncedProgress()
    progress.stored = true
    if let time = word.changedAt {
      progress.changes.append(
        ProgressLogChange(
          id: word.storedID, before: previous.stored, after: word.status.stored, at: time))
    }
    guard heldProgress != nil else { return report(progress) }
    heldProgress = progress
  }

  func holdSyncedProgress() {
    heldProgress = heldProgress ?? SyncedProgress()
  }

  func reportSyncedProgress() {
    guard let progress = heldProgress else { return }
    heldProgress = nil
    report(progress)
  }

  private func report(_ progress: SyncedProgress) {
    guard progress.stored else { return }
    progressObserver?(.synced(progress.changes, totals: totals))
  }

  @discardableResult
  private func store(
    _ status: WordKnowledgeStatus, storedID: String, headword: String, reading: String
  ) -> Bool {
    guard canChange, (records[storedID]?.status ?? .unknown) != status else { return false }
    let record = WordKnowledgeRecord(
      entryID: storedID,
      headword: headword,
      reading: reading,
      status: status,
      updatedAt: now()
    )
    records[storedID] = record
    for shown in listed.keys { listed[shown]?.removeAll { $0.entryID == storedID } }
    if WordKnowledgeStatus.listed.contains(status) {
      listed[status, default: []].insert(record, at: 0)
    }
    persist()
    return true
  }

  func persist() {
    guard canChange else { return }
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

private struct SyncedProgress {
  var changes: [ProgressLogChange] = []
  var stored = false
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

  init(fileURL: URL, sharedCopy: URL?) {
    file = LocalJSONFile(
      fileURL: fileURL, sharedCopy: sharedCopy, currentVersion: StoredFile.currentVersion,
      description: "known words", logCategory: "WordKnowledge")
  }

  func load() async -> (
    records: [String: WordKnowledgeRecord], needsRewrite: Bool,
    readOnlyReason: LocalFileReadOnlyReason?
  ) {
    await file.load(LoadedFile.self, empty: [String: WordKnowledgeRecord]()) { stored in
      let records = stored.records.compactMap(\.value)
      return (Self.byEntryID(records), records.count == stored.records.count)
    }
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
