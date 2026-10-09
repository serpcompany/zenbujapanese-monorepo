import Foundation
import Testing

@testable import SearchExperience

private struct CopyFailed: Error {}

@Suite("Media Library storage")
struct EncounterMediaStorageTests {
  typealias Deletion = MediaLibraryFixture.Deletion
  private let fixture = MediaLibraryFixture()

  @Test("an index that can't be read is kept aside, and new photos save")
  func keepsUnreadableIndexAside() async throws {
    defer { fixture.remove() }
    let unreadable = try fixture.writeIndex(#"{"media":"not a record"}"#)

    let storage = fixture.launch()
    await storage.save(fixture.photo, for: fixture.word)

    #expect(fixture.keptCopies() == [unreadable])
    #expect(await storage.library().map(\.words) == [[fixture.word]])
  }

  @Test("an encounter that can't be read is kept aside, and the readable ones stay")
  func keepsReadableEncounters() async throws {
    defer { fixture.remove() }
    let damaged = try await fixture.savedThenDamaged([fixture.photo])

    #expect(await fixture.launch().library().map(\.words) == [[fixture.word]])
    #expect(fixture.keptCopies() == [damaged])
  }

  @Test(
    "deleting a photo, or its last word, keeps its image while an index kept aside names it",
    arguments: Deletion.allCases)
  func keepsImagesAKeptIndexNames(_ deletion: Deletion) async throws {
    defer { fixture.remove() }
    _ = try await fixture.savedThenDamaged([fixture.photo])

    let storage = fixture.launch()
    await fixture.delete(deletion, of: fixture.photo, from: storage)

    #expect(await storage.library().isEmpty)
    #expect(fixture.keepsImage(of: fixture.photo))
  }

  @Test("an index that can't be decoded at all keeps every image")
  func keepsImagesOfAnUndecodableIndex() async throws {
    defer { fixture.remove() }
    _ = try fixture.writeIndex("")
    try fixture.photo.data.write(to: fixture.imageURL(of: fixture.photo))

    _ = await fixture.launch().library()

    #expect(fixture.keepsImage(of: fixture.photo))
  }

  @Test("an image nothing names, as an earlier version could leave, stays")
  func keepsUnnamedImages() async throws {
    defer { fixture.remove() }
    _ = try fixture.writeIndex(#"{"media":{},"encounters":[]}"#)
    try fixture.photo.data.write(to: fixture.imageURL(of: fixture.photo))

    _ = await fixture.launch().library()

    #expect(fixture.keepsImage(of: fixture.photo))
  }

  @Test("an image whose media record can't be read stays")
  func keepsImagesOfAnUnreadableRecord() async throws {
    defer { fixture.remove() }
    await fixture.launch().save(fixture.photo, for: fixture.word)
    _ = try fixture.damageIndex(replacing: #""name":"ramen.jpg""#, with: #""nam":"ramen.jpg""#)
    _ = await fixture.launch().library()
    try fixture.removeKeptCopies()

    _ = await fixture.launch().library()

    #expect(fixture.keepsImage(of: fixture.photo))
  }

  @Test("an index that can't be written over is kept aside once, not on every read")
  func keepsAsideOncePerLaunch() async throws {
    defer { fixture.remove() }
    _ = try fixture.writeIndex(#"{"media":"not a record"}"#)
    try fixture.setLocked(true, at: fixture.indexURL)

    let storage = fixture.launch()
    #expect(await storage.library().isEmpty)
    #expect(await storage.library().isEmpty)
    #expect(fixture.keptCopies().count == 1)
  }

  @Test("a Media Library from before the index format moves into it")
  func migratesTheOldIndex() async throws {
    defer { fixture.remove() }
    let photoID = fixture.photo.sha256
    _ = try fixture.writeIndex(#"{"taberu-note":{"name":"ramen.jpg","blobID":"\#(photoID)"}}"#)
    try fixture.photo.data.write(to: fixture.imageURL(of: fixture.photo))

    let library = await fixture.launch().library()

    #expect(library.map(\.name) == ["ramen.jpg"])
    #expect(library.flatMap(\.words).map(\.id) == [fixture.word.id])
    #expect(fixture.keptCopies().isEmpty)
  }

  @Test("an index that can't be opened is neither shown nor written over")
  func leavesAnUnopenableIndex() async throws {
    defer { fixture.remove() }
    try FileManager.default.createDirectory(
      at: fixture.indexURL, withIntermediateDirectories: true)

    let storage = fixture.launch()
    await storage.save(fixture.photo, for: fixture.word)

    #expect(await storage.library().isEmpty)
    #expect(!fixture.keepsImage(of: fixture.photo))
    #expect(fixture.keptCopies().isEmpty)
  }

  @Test("an index that can't be copied aside is neither shown nor written over")
  func leavesAnIndexItCantKeep() async throws {
    defer { fixture.remove() }
    let unreadable = try fixture.writeIndex(#"{"media":"not a record"}"#)

    let storage = EncounterMediaStorage(
      directory: fixture.directory, keepCopy: { _ in throw CopyFailed() })
    await storage.save(fixture.photo, for: fixture.word)

    #expect(await storage.library().isEmpty)
    #expect(try Data(contentsOf: fixture.indexURL) == unreadable)
    #expect(fixture.keptCopies().isEmpty)
  }
}
