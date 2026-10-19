import Foundation

struct EncounterMediaAttachment: Hashable, Sendable {
  let name: String
  let data: Data

  var sha256: String {
    data.sha256
  }
}

struct EncounterWordReference: Codable, Hashable, Sendable {
  let id: SavedItemID
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
  var deleteImagesDue: @Sendable () async -> Void

  static let live = EncounterMediaStore(
    encounters: { word in await EncounterMediaStorage.shared.encounters(for: word) },
    save: { attachment, word in await EncounterMediaStorage.shared.save(attachment, for: word) },
    remove: { word, mediaID in await EncounterMediaStorage.shared.remove(word, mediaID: mediaID) },
    library: { await EncounterMediaStorage.shared.library() },
    media: { mediaID in await EncounterMediaStorage.shared.media(mediaID) },
    deleteMedia: { mediaID in await EncounterMediaStorage.shared.deleteMedia(mediaID) },
    deleteImagesDue: { await EncounterMediaStorage.shared.deleteImagesDue() }
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

  private static let retryInterval: TimeInterval = 24 * 60 * 60

  static let shared = EncounterMediaStorage(
    directory: defaultDirectory,
    legacyDirectory: legacyDefaultDirectory,
    placing: .live
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
  private let keepCopy: @Sendable (URL) throws -> Void
  private let now: @Sendable () -> Date
  private let placing: SavedKeyLookup
  private let deferredDeletions: DeferredImageDeletions
  private var preparation: Task<Void, Never>?
  private var lastRetry: Date?
  nonisolated let relay = KeptChangeRelay()

  init(
    directory: URL, legacyDirectory: URL? = nil, placing: SavedKeyLookup,
    keepCopy: @escaping @Sendable (URL) throws -> Void = { _ = try UnreadableCopy.keep(file: $0) },
    now: @escaping @Sendable () -> Date = Date.init
  ) {
    self.directory = directory
    self.legacyDirectory = legacyDirectory
    self.placing = placing
    self.keepCopy = keepCopy
    self.now = now
    indexURL = directory.appending(path: "index.json")
    deferredDeletions = DeferredImageDeletions(
      fileURL: directory.appending(path: "deferred-deletions.json"), keepCopy: keepCopy, now: now)
  }

  func encounters(for word: EncounterWordReference) async -> [EncounterMedia] {
    await prepared()
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

  func save(_ attachment: EncounterMediaAttachment, for word: EncounterWordReference) async {
    await prepared()
    guard !attachment.data.isEmpty, var current = index() else { return }
    let mediaID = attachment.sha256
    let now = Date()
    let destination = blobURL(mediaID)
    if !FileManager.default.fileExists(atPath: destination.path) {
      try? attachment.data.write(to: destination, options: .atomic)
    }
    guard FileManager.default.fileExists(atPath: destination.path) else { return }
    let isNew = current.media[mediaID] == nil
    if isNew {
      current.media[mediaID] = MediaRecord(name: attachment.name, savedAt: now)
    }
    let wasOnWord = current.encounters.contains { $0.word.id == word.id && $0.mediaID == mediaID }
    current.encounters.removeAll { $0.word.id == word.id && $0.mediaID == mediaID }
    current.encounters.append(EncounterRecord(word: word, mediaID: mediaID, savedAt: now))
    guard write(current) else { return }
    deferredDeletions.remove(mediaID)
    if isNew {
      await relay.post(
        KeptChanges.photoAdded(KeptPhoto(id: mediaID, name: attachment.name, savedAt: now)))
    }
    if !wasOnWord {
      await relay.post(KeptChanges.photoWordAdded(Self.kept(word, on: mediaID, savedAt: now)))
    }
  }

  func remove(_ word: EncounterWordReference, mediaID: String) async {
    await prepared()
    guard removing(word.id, from: mediaID) else { return }
    await relay.post(KeptChanges.photoWordRemoved(mediaID, word.id.rawValue))
  }

  private func removing(_ wordID: SavedItemID, from mediaID: String) -> Bool {
    removing([(wordID, mediaID)])
  }

  private func removing(_ words: [(id: SavedItemID, mediaID: String)]) -> Bool {
    guard var current = index() else { return false }
    let matches = { (encounter: EncounterRecord) in
      words.contains { $0.id == encounter.word.id && $0.mediaID == encounter.mediaID }
    }
    let wasOnWord = current.encounters.contains(where: matches)
    current.encounters.removeAll(where: matches)
    let emptied = Set(words.map(\.mediaID)).filter { mediaID in
      current.media[mediaID] != nil && !current.encounters.contains { $0.mediaID == mediaID }
    }
    for mediaID in emptied { current.media[mediaID] = nil }
    guard write(current) else { return false }
    emptied.forEach(deleteImage)
    return wasOnWord
  }

  func keptPhotos() async -> (photos: [KeptPhoto], words: [KeptPhotoWord]) {
    await prepared()
    guard let current = index() else { return ([], []) }
    let shown = current.media.filter { mediaID, _ in
      blobExists(mediaID) && current.encounters.contains { $0.mediaID == mediaID }
    }
    let photos = shown.map { KeptPhoto(id: $0.key, name: $0.value.name, savedAt: $0.value.savedAt) }
      .sorted { $0.savedAt < $1.savedAt }
    let words = current.encounters.filter { shown[$0.mediaID] != nil }
      .sorted { $0.savedAt < $1.savedAt }
      .map { Self.kept($0.word, on: $0.mediaID, savedAt: $0.savedAt) }
    return (photos, words)
  }

  func fileData(_ mediaID: String) async -> Data? {
    await prepared()
    return try? Data(contentsOf: blobURL(mediaID))
  }

  func storeFile(_ data: Data, as mediaID: String) async -> Bool {
    await prepared()
    guard data.sha256 == mediaID else { return false }
    if !blobExists(mediaID) { try? data.write(to: blobURL(mediaID), options: .atomic) }
    return blobExists(mediaID)
  }

  func applySynced(photos: [KeptPhoto]) async -> Set<String> {
    guard !photos.isEmpty else { return [] }
    await prepared()
    guard var current = index() else { return [] }
    let placed = photos.filter { blobExists($0.id) }
    for photo in placed {
      current.media[photo.id] = MediaRecord(name: photo.name, savedAt: photo.savedAt)
    }
    guard write(current) else { return [] }
    for photo in placed { deferredDeletions.remove(photo.id) }
    return Set(placed.map(\.id))
  }

  func applySynced(words: [KeptPhotoWord]) async -> [KeptPhotoWord] {
    await prepared()
    guard var current = index() else { return words }
    var unplaced: [KeptPhotoWord] = []
    for word in words {
      guard current.media[word.photoID] != nil, blobExists(word.photoID) else {
        unplaced.append(word)
        continue
      }
      let id = SavedItemID(rawValue: word.item)
      guard !current.encounters.contains(where: { $0.word.id == id && $0.mediaID == word.photoID })
      else { continue }
      current.encounters.append(
        EncounterRecord(
          word: EncounterWordReference(id: id, headword: word.headword, reading: word.reading),
          mediaID: word.photoID, savedAt: word.savedAt))
    }
    return write(current) ? unplaced : words
  }

  func applySyncedRemoval(ofWords words: [(item: String, mediaID: String)]) async {
    guard !words.isEmpty else { return }
    await prepared()
    _ = removing(words.map { (SavedItemID(rawValue: $0.item), $0.mediaID) })
  }

  func applySyncedRemoval(ofPhoto mediaID: String) async {
    await prepared()
    deleting(mediaID)
  }

  private static func kept(
    _ word: EncounterWordReference, on mediaID: String, savedAt: Date
  ) -> KeptPhotoWord {
    KeptPhotoWord(
      photoID: mediaID, item: word.id.rawValue, headword: word.headword, reading: word.reading,
      savedAt: savedAt)
  }

  func library() async -> [EncounterMediaSummary] {
    await prepared()
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

  func media(_ mediaID: String) async -> EncounterMedia? {
    await prepared()
    return loadMedia(mediaID, record: index()?.media[mediaID])
  }

  func deleteMedia(_ mediaID: String) async {
    await prepared()
    guard deleting(mediaID) else { return }
    await relay.post(KeptChanges.photoDeleted(mediaID))
  }

  @discardableResult
  private func deleting(_ mediaID: String) -> Bool {
    guard var current = index() else { return false }
    let existed = current.media[mediaID] != nil
    current.encounters.removeAll { $0.mediaID == mediaID }
    current.media[mediaID] = nil
    guard write(current) else { return false }
    deleteImage(mediaID)
    return existed
  }

  func deleteImagesDue() async {
    await prepared()
    _ = index()
  }

  private func deleteImage(_ mediaID: String) {
    if let kept = keptCopiesNames(), !kept.contains(mediaID), removeImage(mediaID) { return }
    deferredDeletions.add(mediaID)
  }

  private func retryDeferredDeletions(named index: Index) {
    let today = now()
    if let lastRetry, today.timeIntervalSince(lastRetry) < Self.retryInterval { return }
    lastRetry = today
    guard let waiting = deferredDeletions.load(), !waiting.isEmpty, let kept = keptCopiesNames()
    else { return }
    let named = Set(index.media.keys).union(index.encounters.map(\.mediaID))
    var stillWaiting = waiting
    for (mediaID, deferredAt) in waiting {
      let waitIsOver = today.timeIntervalSince(deferredAt) >= DeferredImageDeletions.longestWait
      if named.contains(mediaID)
        || ((waitIsOver || !kept.contains(mediaID)) && removeImage(mediaID))
      {
        stillWaiting[mediaID] = nil
      }
    }
    if stillWaiting.count < waiting.count { deferredDeletions.save(stillWaiting) }
  }

  private func removeImage(_ mediaID: String) -> Bool {
    do {
      try FileManager.default.removeItem(at: blobURL(mediaID))
      return true
    } catch CocoaError.fileNoSuchFile {
      return true
    } catch {
      return false
    }
  }

  private func keptCopiesNames() -> Set<String>? {
    var names: Set<String> = []
    for copy in UnreadableCopy.copies(of: indexURL) {
      guard let data = try? Data(contentsOf: copy) else { return nil }
      names.formUnion(DeferredImageDeletions.mediaIDs(in: data))
    }
    return names
  }

  private func prepared() async {
    if preparation == nil {
      preparation = Task {
        prepareDirectory()
        await placeEarlierWords()
      }
    }
    await preparation?.value
  }

  private func placeEarlierWords() async {
    guard var current = index() else { return }
    let places = await placing.places(for: current.encounters.map(\.word.id))
    let placed = (places?.words ?? [:]).filter { $0.key != $0.value.id }
    guard !placed.isEmpty else { return }
    var kept = Set<[String]>()
    current.encounters = current.encounters.compactMap { encounter in
      let word = placed[encounter.word.id].map {
        EncounterWordReference(
          id: $0.id, headword: encounter.word.headword, reading: encounter.word.reading)
      }
      let moved = EncounterRecord(
        word: word ?? encounter.word, mediaID: encounter.mediaID, savedAt: encounter.savedAt)
      return kept.insert([moved.word.id.rawValue, moved.mediaID]).inserted ? moved : nil
    }
    _ = write(current)
  }

  private func prepareDirectory() {
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
            id: SavedItemID(rawValue: wordID), headword: "Saved Word", reading: ""),
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
