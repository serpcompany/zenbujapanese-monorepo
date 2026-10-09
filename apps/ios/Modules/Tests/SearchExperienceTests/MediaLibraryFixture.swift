import Foundation

@testable import SearchExperience

struct MediaLibraryFixture {
  enum Deletion: CaseIterable, Sendable {
    case wholePhoto
    case lastWord
  }

  static let firstDay = Date(timeIntervalSince1970: 1_800_000_000)

  let directory = FileManager.default.temporaryDirectory
    .appending(path: "encounter-media-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
  let word = EncounterWordReference(
    id: WordNoteID(rawValue: "taberu-note"), headword: "食べる", reading: "たべる")
  let photo = EncounterMediaAttachment(name: "ramen.jpg", data: Data([1, 2, 3]))
  let otherPhoto = EncounterMediaAttachment(name: "sushi.jpg", data: Data([4, 5, 6]))

  var indexURL: URL { directory.appending(path: "index.json") }
  var deferredURL: URL { directory.appending(path: "deferred-deletions.json") }

  func imageURL(of attachment: EncounterMediaAttachment) -> URL {
    directory.appending(path: "\(attachment.sha256).image")
  }

  func keepsImage(of attachment: EncounterMediaAttachment) -> Bool {
    FileManager.default.fileExists(atPath: imageURL(of: attachment).path)
  }

  func launch(onDay day: Double = 0) -> EncounterMediaStorage {
    EncounterMediaStorage(directory: directory, now: { Self.firstDay + day * 24 * 60 * 60 })
  }

  func delete(
    _ deletion: Deletion, of attachment: EncounterMediaAttachment,
    from storage: EncounterMediaStorage
  ) async {
    switch deletion {
    case .wholePhoto: await storage.deleteMedia(attachment.sha256)
    case .lastWord: await storage.remove(word, mediaID: attachment.sha256)
    }
  }

  func savedThenDamaged(_ photos: [EncounterMediaAttachment]) async throws -> Data {
    for saved in photos { await launch().save(saved, for: word) }
    return try damageIndex(replacing: #""encounters":["#, with: #""encounters":[5,"#)
  }

  func damageIndex(replacing text: String, with damage: String) throws -> Data {
    let saved = try String(contentsOf: indexURL, encoding: .utf8)
    return try writeIndex(saved.replacingOccurrences(of: text, with: damage))
  }

  func writeIndex(_ json: String) throws -> Data {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let data = Data(json.utf8)
    try data.write(to: indexURL)
    return data
  }

  func writeDeferred(_ deferred: [String: Date]) throws {
    try JSONEncoder.localStore.encode(deferred).write(to: deferredURL)
  }

  func deferredIDs() -> Set<String>? {
    guard let data = try? Data(contentsOf: deferredURL) else { return nil }
    let deferred = try? JSONDecoder.localStore.decode([String: Date].self, from: data)
    return deferred.map { Set($0.keys) }
  }

  func removeKeptCopies() throws {
    for copy in UnreadableCopy.copies(of: indexURL) {
      try FileManager.default.removeItem(at: copy)
    }
  }

  func keptCopies(of fileURL: URL? = nil) -> [Data] {
    UnreadableCopy.copies(of: fileURL ?? indexURL).compactMap { try? Data(contentsOf: $0) }
  }

  var hasDeferredList: Bool { FileManager.default.fileExists(atPath: deferredURL.path) }

  func setLocked(_ locked: Bool, at url: URL) throws {
    try FileManager.default.setAttributes([.immutable: locked], ofItemAtPath: url.path)
  }

  func setReadable(_ readable: Bool, at url: URL) throws {
    try FileManager.default.setAttributes(
      [.posixPermissions: readable ? 0o644 : 0o000], ofItemAtPath: url.path)
  }

  func remove() {
    let images = [photo, otherPhoto].map(imageURL(of:))
    for url in [directory, indexURL, deferredURL] + images + UnreadableCopy.copies(of: indexURL) {
      try? setLocked(false, at: url)
    }
    try? setReadable(true, at: deferredURL)
    try? FileManager.default.removeItem(at: directory)
  }
}
