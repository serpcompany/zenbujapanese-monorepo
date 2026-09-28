import Foundation
import Observation
import OSLog

enum WordKnowledgeStatus: String, Codable, Sendable {
  case known
  case unknown
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
/// file loads off the main actor; changes made before it finishes are kept over loaded ones.
@MainActor
@Observable
final class WordKnowledge {
  static let shared = WordKnowledge()

  private(set) var records: [String: WordKnowledgeRecord] = [:]
  /// Known words, most recently marked first.
  private(set) var knownRecords: [WordKnowledgeRecord] = []
  @ObservationIgnored private let writer: WordKnowledgeWriter
  @ObservationIgnored private var lastWrite: Task<Void, Never>?
  @ObservationIgnored private var hasUnsavedChanges = false

  init(fileURL: URL = WordKnowledge.defaultFileURL) {
    let writer = WordKnowledgeWriter(fileURL: fileURL)
    self.writer = writer
    lastWrite = Task {
      let loaded = await writer.load()
      records = loaded.merging(records) { _, current in current }
      knownRecords = records.values
        .filter { $0.status == .known }
        .sorted { $0.updatedAt > $1.updatedAt }
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
    guard self.status(id) != status else { return }
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
  /// holds loaded records too.
  private func persist() {
    let previous = lastWrite
    let writer = writer
    lastWrite = Task {
      await previous?.value
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
    var version = 1
    var records: [WordKnowledgeRecord]
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

  private static let logger = Logger(subsystem: "com.zenbujapanese", category: "WordKnowledge")
  private let fileURL: URL

  init(fileURL: URL) {
    self.fileURL = fileURL
  }

  /// A missing file loads as no records. A file that can't be read in full is kept beside it
  /// before the next write replaces it.
  func load() -> [String: WordKnowledgeRecord] {
    guard let data = try? Data(contentsOf: fileURL) else { return [:] }
    guard let stored = try? JSONDecoder.wordKnowledge.decode(LoadedFile.self, from: data) else {
      preserveUnreadableFile()
      return [:]
    }
    let records = stored.records.compactMap(\.self)
    if records.count != stored.records.count { preserveUnreadableFile() }
    return Dictionary(records.map { ($0.entryID, $0) }) { _, latest in latest }
  }

  /// Returns whether the records reached the disk.
  func write(_ records: [WordKnowledgeRecord]) -> Bool {
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

  private func preserveUnreadableFile() {
    let stamp = Int(Date().timeIntervalSince1970)
    let backup = fileURL.deletingLastPathComponent()
      .appending(path: "word-knowledge.unreadable-\(stamp).json")
    try? FileManager.default.copyItem(at: fileURL, to: backup)
    Self.logger.error("Kept an unreadable known-words file at \(backup.lastPathComponent)")
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
