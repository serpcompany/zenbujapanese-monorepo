import Foundation

struct EncounterMediaAttachment: Hashable, Sendable {
  let name: String
  let data: Data

  var sha256: String {
    data.sha256
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
    encounters: { word in await EncounterMediaStorage.shared.encounters(for: word) },
    save: { attachment, word in await EncounterMediaStorage.shared.save(attachment, for: word) },
    remove: { word, mediaID in await EncounterMediaStorage.shared.remove(word, mediaID: mediaID) },
    library: { await EncounterMediaStorage.shared.library() },
    media: { mediaID in await EncounterMediaStorage.shared.media(mediaID) },
    deleteMedia: { mediaID in await EncounterMediaStorage.shared.deleteMedia(mediaID) }
  )

}

actor EncounterMediaStorage {
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

  private struct StoredIndex: Decodable {
    let media: [String: LossyDecodable<MediaRecord>]
    let encounters: [LossyDecodable<EncounterRecord>]
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
  private let deferredDeletionsURL: URL
  private let keepCopy: @Sendable (URL) throws -> Void
  private var didPrepare = false
  private var didRetryDeferredDeletions = false

  init(
    directory: URL, legacyDirectory: URL? = nil,
    keepCopy: @escaping @Sendable (URL) throws -> Void = { _ = try UnreadableCopy.keep(file: $0) }
  ) {
    self.directory = directory
    self.legacyDirectory = legacyDirectory
    self.keepCopy = keepCopy
    indexURL = directory.appending(path: "index.json")
    deferredDeletionsURL = directory.appending(path: "deferred-deletions.json")
  }

  func encounters(for word: EncounterWordReference) -> [EncounterMedia] {
    prepareIfNeeded()
    guard var current = index() else { return [] }
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
    guard !attachment.data.isEmpty, var current = index() else { return }
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
    guard var current = index() else { return }
    current.encounters.removeAll { $0.word.id == word.id && $0.mediaID == mediaID }
    let removesMedia = !current.encounters.contains { $0.mediaID == mediaID }
    if removesMedia { current.media[mediaID] = nil }
    guard write(current) else { return }
    if removesMedia { deleteImage(mediaID) }
  }

  func library() -> [EncounterMediaSummary] {
    prepareIfNeeded()
    guard let current = index() else { return [] }
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
    return loadMedia(mediaID, record: index()?.media[mediaID])
  }

  func deleteMedia(_ mediaID: String) {
    prepareIfNeeded()
    guard var current = index() else { return }
    current.encounters.removeAll { $0.mediaID == mediaID }
    current.media[mediaID] = nil
    guard write(current) else { return }
    deleteImage(mediaID)
  }

  private func deleteImage(_ mediaID: String) {
    guard let kept = keptCopiesNames(), !kept.contains(mediaID) else {
      saveDeferredDeletions(deferredDeletions().union([mediaID]))
      return
    }
    try? FileManager.default.removeItem(at: blobURL(mediaID))
  }

  private func retryDeferredDeletions(named index: Index) {
    guard !didRetryDeferredDeletions else { return }
    didRetryDeferredDeletions = true
    let deferred = deferredDeletions()
    guard !deferred.isEmpty, let kept = keptCopiesNames() else { return }
    let named = Set(index.media.keys).union(index.encounters.map(\.mediaID))
    var waiting = deferred
    for mediaID in deferred where named.contains(mediaID) || !kept.contains(mediaID) {
      if !named.contains(mediaID) { try? FileManager.default.removeItem(at: blobURL(mediaID)) }
      waiting.remove(mediaID)
    }
    saveDeferredDeletions(waiting)
  }

  private func keptCopiesNames() -> Set<String>? {
    var names: Set<String> = []
    for copy in UnreadableCopy.copies(of: indexURL) {
      guard let data = try? Data(contentsOf: copy) else { return nil }
      names.formUnion(String(decoding: data, as: UTF8.self).split(separator: "\"").map(String.init))
    }
    return names
  }

  private func deferredDeletions() -> Set<String> {
    guard let data = try? Data(contentsOf: deferredDeletionsURL) else { return [] }
    return Set((try? JSONDecoder().decode([String].self, from: data)) ?? [])
  }

  private func saveDeferredDeletions(_ mediaIDs: Set<String>) {
    guard !mediaIDs.isEmpty else {
      try? FileManager.default.removeItem(at: deferredDeletionsURL)
      return
    }
    guard let data = try? JSONEncoder().encode(mediaIDs.sorted()) else { return }
    try? data.write(to: deferredDeletionsURL, options: .atomic)
  }

  private func prepareIfNeeded() {
    guard !didPrepare else { return }
    didPrepare = true
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

  private func index() -> Index? {
    let data: Data
    do {
      data = try Data(contentsOf: indexURL)
    } catch CocoaError.fileReadNoSuchFile {
      return Index()
    } catch {
      return nil
    }
    guard let index = decoded(data) else { return nil }
    retryDeferredDeletions(named: index)
    return index
  }

  private func decoded(_ data: Data) -> Index? {
    if let stored = try? JSONDecoder().decode(StoredIndex.self, from: data) {
      let readable = Index(
        media: stored.media.compactMapValues(\.value),
        encounters: stored.encounters.compactMap(\.value))
      let lostSome =
        readable.media.count < stored.media.count
        || readable.encounters.count < stored.encounters.count
      return lostSome ? keptAside(readable) : readable
    }
    guard let legacy = try? JSONDecoder().decode([String: LegacyRecord].self, from: data) else {
      return keptAside(Index())
    }
    return migrated(legacy)
  }

  private func keptAside(_ readable: Index) -> Index? {
    guard (try? keepCopy(indexURL)) != nil, write(readable) else { return nil }
    return readable
  }

  private func migrated(_ legacy: [String: LegacyRecord]) -> Index {
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
