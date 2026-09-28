import Foundation
import Observation

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
/// Records are held in memory for fast lookups and saved as one JSON file on the device.
@MainActor
@Observable
final class WordKnowledge {
  private(set) var records: [String: WordKnowledgeRecord]
  @ObservationIgnored private let writer: WordKnowledgeWriter
  @ObservationIgnored private var lastWrite: Task<Void, Never>?

  init(fileURL: URL = WordKnowledge.defaultFileURL) {
    records = WordKnowledgeWriter.load(fileURL)
    writer = WordKnowledgeWriter(fileURL: fileURL)
  }

  func status(_ id: LanguageReferenceID) -> WordKnowledgeStatus {
    records[id.rawValue]?.status ?? .unknown
  }

  func isKnown(_ id: LanguageReferenceID) -> Bool {
    status(id) == .known
  }

  /// Known words, most recently marked first.
  var knownRecords: [WordKnowledgeRecord] {
    records.values
      .filter { $0.status == .known }
      .sorted { $0.updatedAt > $1.updatedAt }
  }

  var knownCount: Int {
    records.values.count { $0.status == .known }
  }

  func setStatus(_ status: WordKnowledgeStatus, for entry: DictionaryEntry) {
    setStatus(status, id: entry.id, headword: entry.headword, reading: entry.reading)
  }

  func setStatus(
    _ status: WordKnowledgeStatus, id: LanguageReferenceID, headword: String, reading: String
  ) {
    guard self.status(id) != status else { return }
    records[id.rawValue] = WordKnowledgeRecord(
      entryID: id.rawValue,
      headword: headword,
      reading: reading,
      status: status,
      updatedAt: Date()
    )
    persist()
  }

  func toggleKnown(_ entry: DictionaryEntry) {
    setStatus(isKnown(entry.id) ? .unknown : .known, for: entry)
  }

  /// Waits until every change so far is on disk.
  func flush() async {
    await lastWrite?.value
  }

  private func persist() {
    let snapshot = Array(records.values)
    let previous = lastWrite
    let writer = writer
    lastWrite = Task {
      await previous?.value
      await writer.write(snapshot)
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

  private let fileURL: URL

  init(fileURL: URL) {
    self.fileURL = fileURL
  }

  /// A missing or unreadable file loads as no records.
  nonisolated static func load(_ fileURL: URL) -> [String: WordKnowledgeRecord] {
    guard let data = try? Data(contentsOf: fileURL),
      let stored = try? JSONDecoder.wordKnowledge.decode(StoredFile.self, from: data)
    else { return [:] }
    return Dictionary(stored.records.map { ($0.entryID, $0) }) { _, latest in latest }
  }

  func write(_ records: [WordKnowledgeRecord]) {
    let sorted = records.sorted { $0.entryID < $1.entryID }
    guard let data = try? JSONEncoder.wordKnowledge.encode(StoredFile(records: sorted)) else {
      return
    }
    try? FileManager.default.createDirectory(
      at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? data.write(to: fileURL, options: .atomic)
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
