import Foundation
import Testing

@testable import SearchExperience

private struct CopyFailed: Error {}

@Suite("Media Library storage")
struct EncounterMediaStorageTests {
  enum Deletion: CaseIterable, Sendable {
    case wholePhoto
    case lastWord
  }

  private let directory = FileManager.default.temporaryDirectory
    .appending(path: "encounter-media-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
  private let word = EncounterWordReference(
    id: WordNoteID(rawValue: "taberu-note"), headword: "食べる", reading: "たべる")
  private let photo = EncounterMediaAttachment(name: "ramen.jpg", data: Data([1, 2, 3]))

  private var indexURL: URL { directory.appending(path: "index.json") }
  private var imageURL: URL { directory.appending(path: "\(photo.sha256).image") }

  @Test("an index that can't be read is kept aside, and new photos save")
  func keepsUnreadableIndexAside() async throws {
    defer { removeDirectory() }
    let unreadable = try writeIndex(#"{"media":"not a record"}"#)

    let storage = EncounterMediaStorage(directory: directory)
    await storage.save(photo, for: word)

    #expect(keptCopies() == [unreadable])
    #expect(await storage.library().map(\.words) == [[word]])
  }

  @Test("an encounter that can't be read is kept aside, and the readable ones stay")
  func keepsReadableEncounters() async throws {
    defer { removeDirectory() }
    let damaged = try await savedThenDamaged()

    #expect(await EncounterMediaStorage(directory: directory).library().map(\.words) == [[word]])
    #expect(keptCopies() == [damaged])
  }

  @Test(
    "deleting a photo, or its last word, keeps its image while an index kept aside names it",
    arguments: Deletion.allCases)
  func keepsImagesAKeptIndexNames(_ deletion: Deletion) async throws {
    defer { removeDirectory() }
    _ = try await savedThenDamaged()

    let storage = EncounterMediaStorage(directory: directory)
    await delete(deletion, from: storage)

    #expect(await storage.library().isEmpty)
    #expect(FileManager.default.fileExists(atPath: imageURL.path))
  }

  @Test(
    "a deleted photo's image stays while a kept copy of the index can't be read, then goes",
    arguments: Deletion.allCases)
  func keepsImagesAnUnreadableCopyMightName(_ deletion: Deletion) async throws {
    defer { removeDirectory() }
    let storage = EncounterMediaStorage(directory: directory)
    await storage.save(photo, for: word)
    let unreadableCopy = directory.appending(path: "index.unreadable-1-unread.json")
    try FileManager.default.createDirectory(at: unreadableCopy, withIntermediateDirectories: true)

    await delete(deletion, from: storage)
    _ = await EncounterMediaStorage(directory: directory).library()
    #expect(FileManager.default.fileExists(atPath: imageURL.path))

    try FileManager.default.removeItem(at: unreadableCopy)
    _ = await EncounterMediaStorage(directory: directory).library()
    #expect(!FileManager.default.fileExists(atPath: imageURL.path))
  }

  @Test("a deleted photo's image goes at a later launch, once no kept copy of the index names it")
  func removesImagesNothingNames() async throws {
    defer { removeDirectory() }
    _ = try await savedThenDamaged()
    await EncounterMediaStorage(directory: directory).deleteMedia(photo.sha256)

    _ = await EncounterMediaStorage(directory: directory).library()
    #expect(FileManager.default.fileExists(atPath: imageURL.path))
    try removeKeptCopies()
    _ = await EncounterMediaStorage(directory: directory).library()
    #expect(!FileManager.default.fileExists(atPath: imageURL.path))
  }

  @Test("an index that can't be decoded at all keeps every image")
  func keepsImagesOfAnUndecodableIndex() async throws {
    defer { removeDirectory() }
    _ = try writeIndex("")
    try photo.data.write(to: imageURL)

    _ = await EncounterMediaStorage(directory: directory).library()

    #expect(FileManager.default.fileExists(atPath: imageURL.path))
  }

  @Test("an image nothing names, as an earlier version could leave, stays")
  func keepsUnnamedImages() async throws {
    defer { removeDirectory() }
    _ = try writeIndex(#"{"media":{},"encounters":[]}"#)
    try photo.data.write(to: imageURL)

    _ = await EncounterMediaStorage(directory: directory).library()

    #expect(FileManager.default.fileExists(atPath: imageURL.path))
  }

  @Test("an image whose media record can't be read, but whose encounter can, stays")
  func keepsImagesAnEncounterNames() async throws {
    defer { removeDirectory() }
    await EncounterMediaStorage(directory: directory).save(photo, for: word)
    let saved = try String(contentsOf: indexURL, encoding: .utf8)
    _ = try writeIndex(
      saved.replacingOccurrences(of: #""name":"ramen.jpg""#, with: #""nam":"ramen.jpg""#))
    _ = await EncounterMediaStorage(directory: directory).library()
    try removeKeptCopies()

    _ = await EncounterMediaStorage(directory: directory).library()

    #expect(FileManager.default.fileExists(atPath: imageURL.path))
  }

  @Test("an index that can't be written over is kept aside once, not on every read")
  func keepsAsideOncePerLaunch() async throws {
    defer { removeDirectory() }
    _ = try writeIndex(#"{"media":"not a record"}"#)
    try setLocked(true, at: indexURL)

    let storage = EncounterMediaStorage(directory: directory)
    #expect(await storage.library().isEmpty)
    #expect(await storage.library().isEmpty)
    #expect(keptCopies().count == 1)
  }

  @Test("a Media Library from before the index format moves into it")
  func migratesTheOldIndex() async throws {
    defer { removeDirectory() }
    _ = try writeIndex(#"{"taberu-note":{"name":"ramen.jpg","blobID":"\#(photo.sha256)"}}"#)
    try photo.data.write(to: imageURL)

    let library = await EncounterMediaStorage(directory: directory).library()

    #expect(library.map(\.name) == ["ramen.jpg"])
    #expect(library.flatMap(\.words).map(\.id) == [word.id])
    #expect(keptCopies().isEmpty)
  }

  @Test("an index that can't be opened is neither shown nor written over")
  func leavesAnUnopenableIndex() async throws {
    defer { removeDirectory() }
    try FileManager.default.createDirectory(at: indexURL, withIntermediateDirectories: true)

    let storage = EncounterMediaStorage(directory: directory)
    await storage.save(photo, for: word)

    #expect(await storage.library().isEmpty)
    #expect(!FileManager.default.fileExists(atPath: imageURL.path))
    #expect(keptCopies().isEmpty)
  }

  @Test("an index that can't be copied aside is neither shown nor written over")
  func leavesAnIndexItCantKeep() async throws {
    defer { removeDirectory() }
    let unreadable = try writeIndex(#"{"media":"not a record"}"#)

    let storage = EncounterMediaStorage(directory: directory, keepCopy: { _ in throw CopyFailed() })
    await storage.save(photo, for: word)

    #expect(await storage.library().isEmpty)
    #expect(try Data(contentsOf: indexURL) == unreadable)
    #expect(keptCopies().isEmpty)
  }

  private func delete(_ deletion: Deletion, from storage: EncounterMediaStorage) async {
    switch deletion {
    case .wholePhoto: await storage.deleteMedia(photo.sha256)
    case .lastWord: await storage.remove(word, mediaID: photo.sha256)
    }
  }

  private func savedThenDamaged() async throws -> Data {
    await EncounterMediaStorage(directory: directory).save(photo, for: word)
    let saved = try String(contentsOf: indexURL, encoding: .utf8)
    return try writeIndex(
      saved.replacingOccurrences(of: #""encounters":["#, with: #""encounters":[5,"#))
  }

  private func writeIndex(_ json: String) throws -> Data {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let data = Data(json.utf8)
    try data.write(to: indexURL)
    return data
  }

  private func removeKeptCopies() throws {
    for copy in UnreadableCopy.copies(of: indexURL) {
      try FileManager.default.removeItem(at: copy)
    }
  }

  private func keptCopies() -> [Data] {
    UnreadableCopy.copies(of: indexURL).compactMap { try? Data(contentsOf: $0) }
  }

  private func setLocked(_ locked: Bool, at url: URL) throws {
    try FileManager.default.setAttributes([.immutable: locked], ofItemAtPath: url.path)
  }

  private func removeDirectory() {
    for url in [directory, indexURL] + UnreadableCopy.copies(of: indexURL) {
      try? setLocked(false, at: url)
    }
    try? FileManager.default.removeItem(at: directory)
  }
}
