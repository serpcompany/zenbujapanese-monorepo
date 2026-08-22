import CryptoKit
import Foundation

struct WordImageAttachment: Hashable, Sendable {
  let name: String
  let data: Data
}

struct WordImageAttachmentStore: Sendable {
  var load: @Sendable (WordNoteID) async -> WordImageAttachment?
  var save: @Sendable (WordImageAttachment, WordNoteID) async -> Void
  var remove: @Sendable (WordNoteID) async -> Void

  static let live = WordImageAttachmentStore(
    load: { id in await WordImageAttachmentStorage.shared.load(id) },
    save: { attachment, id in await WordImageAttachmentStorage.shared.save(attachment, for: id) },
    remove: { id in await WordImageAttachmentStorage.shared.remove(id) }
  )

  static func fileBacked(directory: URL) -> WordImageAttachmentStore {
    let storage = WordImageAttachmentStorage(directory: directory)
    return WordImageAttachmentStore(
      load: { id in await storage.load(id) },
      save: { attachment, id in await storage.save(attachment, for: id) },
      remove: { id in await storage.remove(id) }
    )
  }
}

actor WordImageAttachmentStorage {
  private struct Record: Codable {
    let name: String
    let blobID: String
  }

  static let shared = WordImageAttachmentStorage(directory: defaultDirectory)

  private static let defaultDirectory = FileManager.default.urls(
    for: .applicationSupportDirectory,
    in: .userDomainMask
  )[0]
  .appending(path: "Zenbu Japanese", directoryHint: .isDirectory)
  .appending(path: "Word Image Attachments", directoryHint: .isDirectory)

  private let directory: URL
  private let indexURL: URL
  private var didPrepare = false

  init(directory: URL) {
    self.directory = directory
    indexURL = directory.appending(path: "index.json")
  }

  func load(_ id: WordNoteID) -> WordImageAttachment? {
    prepareIfNeeded()
    guard let record = index()[id.rawValue],
      let data = try? Data(contentsOf: blobURL(record.blobID)),
      !data.isEmpty
    else { return nil }
    return WordImageAttachment(name: record.name, data: data)
  }

  func save(_ attachment: WordImageAttachment, for id: WordNoteID) {
    prepareIfNeeded()
    guard !attachment.data.isEmpty else { return }
    var records = index()
    let replaced = records[id.rawValue]
    let blobID = SHA256.hash(data: attachment.data).map { String(format: "%02x", $0) }.joined()
    let destination = blobURL(blobID)
    if !FileManager.default.fileExists(atPath: destination.path) {
      try? attachment.data.write(to: destination, options: .atomic)
    }
    guard FileManager.default.fileExists(atPath: destination.path) else { return }
    records[id.rawValue] = Record(name: attachment.name, blobID: blobID)
    guard write(records) else { return }
    if let replaced, replaced.blobID != blobID { removeBlobIfUnreferenced(replaced.blobID, in: records) }
  }

  func remove(_ id: WordNoteID) {
    prepareIfNeeded()
    var records = index()
    guard let removed = records.removeValue(forKey: id.rawValue), write(records) else { return }
    removeBlobIfUnreferenced(removed.blobID, in: records)
  }

  private func prepareIfNeeded() {
    guard !didPrepare else { return }
    didPrepare = true
    #if DEBUG
      if ProcessInfo.processInfo.arguments.contains("-ResetWordImageAttachments") {
        try? FileManager.default.removeItem(at: directory)
      }
    #endif
    try? FileManager.default.createDirectory(
      at: directory,
      withIntermediateDirectories: true
    )
    var resourceValues = URLResourceValues()
    resourceValues.isExcludedFromBackup = true
    var mutableDirectory = directory
    try? mutableDirectory.setResourceValues(resourceValues)
  }

  private func index() -> [String: Record] {
    guard let data = try? Data(contentsOf: indexURL) else { return [:] }
    return (try? JSONDecoder().decode([String: Record].self, from: data)) ?? [:]
  }

  private func write(_ records: [String: Record]) -> Bool {
    guard let data = try? JSONEncoder().encode(records) else { return false }
    do {
      try data.write(to: indexURL, options: .atomic)
      return true
    } catch {
      return false
    }
  }

  private func blobURL(_ id: String) -> URL {
    directory.appending(path: "\(id).image")
  }

  private func removeBlobIfUnreferenced(_ blobID: String, in records: [String: Record]) {
    guard !records.values.contains(where: { $0.blobID == blobID }) else { return }
    try? FileManager.default.removeItem(at: blobURL(blobID))
  }
}
