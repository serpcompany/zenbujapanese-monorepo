import CryptoKit
import Foundation

struct EncounterMediaAttachment: Hashable, Sendable {
  let name: String
  let data: Data

  var sha256: String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }
}

struct EncounterWordReference: Codable, Hashable, Sendable {
  let id: WordNoteID
  let headword: String
  let reading: String
}

struct EncounterMedia: Identifiable, Hashable, Sendable {
  let id: String
  let name: String
  let data: Data
  let savedAt: Date
}

struct EncounterMediaSummary: Identifiable, Hashable, Sendable {
  let id: String
  let name: String
  let savedAt: Date
  let words: [EncounterWordReference]
}

struct EncounterMediaStore: Sendable {
  var encounters: @Sendable (EncounterWordReference) async -> [EncounterMedia]
  var save: @Sendable (EncounterMediaAttachment, EncounterWordReference) async -> Void
  var remove: @Sendable (EncounterWordReference, String) async -> Void
  var library: @Sendable () async -> [EncounterMediaSummary]
  var media: @Sendable (String) async -> EncounterMedia?
  var deleteMedia: @Sendable (String) async -> Void

  static let live = EncounterMediaStore(
    encounters: { word in
      #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-InjectCorruptEncounterMedia") {
          return [
            EncounterMedia(
              id: "corrupt-media-fixture",
              name: "corrupt-media.image",
              data: Data([0x00]),
              savedAt: .now
            )
          ]
        }
      #endif
      return await EncounterMediaStorage.shared.encounters(for: word)
    },
    save: { attachment, word in await EncounterMediaStorage.shared.save(attachment, for: word) },
    remove: { word, mediaID in await EncounterMediaStorage.shared.remove(word, mediaID: mediaID) },
    library: { await EncounterMediaStorage.shared.library() },
    media: { mediaID in await EncounterMediaStorage.shared.media(mediaID) },
    deleteMedia: { mediaID in await EncounterMediaStorage.shared.deleteMedia(mediaID) }
  )

  static func fileBacked(directory: URL, legacyDirectory: URL? = nil) -> EncounterMediaStore {
    let storage = EncounterMediaStorage(directory: directory, legacyDirectory: legacyDirectory)
    return EncounterMediaStore(
      encounters: { word in await storage.encounters(for: word) },
      save: { attachment, word in await storage.save(attachment, for: word) },
      remove: { word, mediaID in await storage.remove(word, mediaID: mediaID) },
      library: { await storage.library() },
      media: { mediaID in await storage.media(mediaID) },
      deleteMedia: { mediaID in await storage.deleteMedia(mediaID) }
    )
  }
}

private actor EncounterMediaStorage {
  private struct MediaRecord: Codable {
    let name: String
    let savedAt: Date
  }

  private struct EncounterRecord: Codable, Hashable {
    let word: EncounterWordReference
    let mediaID: String
    let savedAt: Date
  }

  private struct Index: Codable {
    var media: [String: MediaRecord] = [:]
    var encounters: [EncounterRecord] = []
  }

  private struct LegacyRecord: Codable {
    let name: String
    let blobID: String
  }

  static let shared = EncounterMediaStorage(
    directory: defaultDirectory,
    legacyDirectory: legacyDefaultDirectory
  )

  private static let defaultDirectory = FileManager.default.urls(
    for: .applicationSupportDirectory,
    in: .userDomainMask
  )[0]
  .appending(path: "Zenbu Japanese", directoryHint: .isDirectory)
  .appending(path: "Encounter Media", directoryHint: .isDirectory)

  private static let legacyDefaultDirectory = FileManager.default.urls(
    for: .applicationSupportDirectory,
    in: .userDomainMask
  )[0]
  .appending(path: "Zenbu Japanese", directoryHint: .isDirectory)
  .appending(path: "Word Image Attachments", directoryHint: .isDirectory)

  private let directory: URL
  private let legacyDirectory: URL?
  private let indexURL: URL
  private var didPrepare = false

  init(directory: URL, legacyDirectory: URL? = nil) {
    self.directory = directory
    self.legacyDirectory = legacyDirectory
    indexURL = directory.appending(path: "index.json")
  }

  func encounters(for word: EncounterWordReference) -> [EncounterMedia] {
    prepareIfNeeded()
    var current = index()
    var changed = false
    current.encounters = current.encounters.map { encounter in
      guard encounter.word.id == word.id, encounter.word != word else { return encounter }
      changed = true
      return EncounterRecord(word: word, mediaID: encounter.mediaID, savedAt: encounter.savedAt)
    }
    if changed { _ = write(current) }
    return current.encounters
      .filter { $0.word.id == word.id }
      .sorted { $0.savedAt > $1.savedAt }
      .compactMap { loadMedia($0.mediaID, record: current.media[$0.mediaID]) }
  }

  func save(_ attachment: EncounterMediaAttachment, for word: EncounterWordReference) {
    prepareIfNeeded()
    guard !attachment.data.isEmpty else { return }
    var current = index()
    let mediaID = attachment.sha256
    let now = Date()
    let destination = blobURL(mediaID)
    if !FileManager.default.fileExists(atPath: destination.path) {
      try? attachment.data.write(to: destination, options: .atomic)
    }
    guard FileManager.default.fileExists(atPath: destination.path) else { return }
    if current.media[mediaID] == nil {
      current.media[mediaID] = MediaRecord(name: attachment.name, savedAt: now)
    }
    current.encounters.removeAll { $0.word.id == word.id && $0.mediaID == mediaID }
    current.encounters.append(EncounterRecord(word: word, mediaID: mediaID, savedAt: now))
    _ = write(current)
  }

  func remove(_ word: EncounterWordReference, mediaID: String) {
    prepareIfNeeded()
    var current = index()
    current.encounters.removeAll { $0.word.id == word.id && $0.mediaID == mediaID }
    let removesMedia = !current.encounters.contains { $0.mediaID == mediaID }
    if removesMedia { current.media[mediaID] = nil }
    guard write(current) else { return }
    if removesMedia { try? FileManager.default.removeItem(at: blobURL(mediaID)) }
  }

  func library() -> [EncounterMediaSummary] {
    prepareIfNeeded()
    let current = index()
    return current.media.compactMap { mediaID, record in
      guard blobExists(mediaID) else { return nil }
      let words = Set(current.encounters.filter { $0.mediaID == mediaID }.map(\.word))
        .sorted { lhs, rhs in
          if lhs.headword != rhs.headword { return lhs.headword < rhs.headword }
          return lhs.id.rawValue < rhs.id.rawValue
        }
      guard !words.isEmpty else { return nil }
      return EncounterMediaSummary(
        id: mediaID,
        name: record.name,
        savedAt: record.savedAt,
        words: words
      )
    }.sorted { $0.savedAt > $1.savedAt }
  }

  func media(_ mediaID: String) -> EncounterMedia? {
    prepareIfNeeded()
    let current = index()
    return loadMedia(mediaID, record: current.media[mediaID])
  }

  func deleteMedia(_ mediaID: String) {
    prepareIfNeeded()
    var current = index()
    current.encounters.removeAll { $0.mediaID == mediaID }
    current.media[mediaID] = nil
    guard write(current) else { return }
    try? FileManager.default.removeItem(at: blobURL(mediaID))
  }

  private func prepareIfNeeded() {
    guard !didPrepare else { return }
    didPrepare = true
    #if DEBUG
      if ProcessInfo.processInfo.arguments.contains("-ResetEncounterMedia")
        || ProcessInfo.processInfo.arguments.contains("-ResetWordImageAttachments")
      {
        try? FileManager.default.removeItem(at: directory)
        if let legacyDirectory { try? FileManager.default.removeItem(at: legacyDirectory) }
      }
    #endif
    if !FileManager.default.fileExists(atPath: directory.path),
      let legacyDirectory,
      FileManager.default.fileExists(atPath: legacyDirectory.path)
    {
      try? FileManager.default.moveItem(at: legacyDirectory, to: directory)
    }
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = false
    var mutableDirectory = directory
    try? mutableDirectory.setResourceValues(values)
  }

  private func index() -> Index {
    guard let data = try? Data(contentsOf: indexURL) else { return Index() }
    if let current = try? JSONDecoder().decode(Index.self, from: data) { return current }
    guard let legacy = try? JSONDecoder().decode([String: LegacyRecord].self, from: data) else {
      return Index()
    }
    let date = Date.distantPast
    var migrated = Index()
    for (wordID, record) in legacy {
      migrated.media[record.blobID] = MediaRecord(name: record.name, savedAt: date)
      migrated.encounters.append(
        EncounterRecord(
          word: EncounterWordReference(
            id: WordNoteID(rawValue: wordID), headword: "Saved Word", reading: ""),
          mediaID: record.blobID,
          savedAt: date
        )
      )
    }
    _ = write(migrated)
    return migrated
  }

  private func write(_ index: Index) -> Bool {
    guard let data = try? JSONEncoder().encode(index) else { return false }
    do {
      try data.write(to: indexURL, options: .atomic)
      return true
    } catch {
      return false
    }
  }

  private func loadMedia(_ id: String, record: MediaRecord?) -> EncounterMedia? {
    guard let record,
      let data = try? Data(contentsOf: blobURL(id)),
      !data.isEmpty
    else { return nil }
    return EncounterMedia(id: id, name: record.name, data: data, savedAt: record.savedAt)
  }

  private func blobURL(_ id: String) -> URL {
    directory.appending(path: "\(id).image")
  }

  private func blobExists(_ id: String) -> Bool {
    let attributes = try? FileManager.default.attributesOfItem(atPath: blobURL(id).path)
    return (attributes?[.size] as? Int ?? 0) > 0
  }
}
