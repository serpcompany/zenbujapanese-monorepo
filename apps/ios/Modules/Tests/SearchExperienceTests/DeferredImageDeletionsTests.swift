import Foundation
import Testing
import os

@testable import SearchExperience

@Suite("Media Library: deleted photos' images")
struct DeferredImageDeletionsTests {
  typealias Deletion = MediaLibraryFixture.Deletion
  private let fixture = MediaLibraryFixture()
  private var photoID: String { fixture.photo.sha256 }

  @Test(
    "a deleted photo's image goes at once when no kept copy of the index names it",
    arguments: Deletion.allCases)
  func removesUnnamedImagesAtOnce(_ deletion: Deletion) async throws {
    defer { fixture.remove() }
    let storage = fixture.launch()
    await storage.save(fixture.photo, for: fixture.word)

    await fixture.delete(deletion, of: fixture.photo, from: storage)

    #expect(!fixture.keepsImage(of: fixture.photo))
    #expect(!fixture.hasDeferredList)
  }

  @Test("a deleted photo's image goes at a later launch, once no kept copy of the index names it")
  func removesImagesNothingNames() async throws {
    defer { fixture.remove() }
    _ = try await fixture.deletedWhileAKeptCopyNamesIt()
    #expect(fixture.deferredIDs() == [photoID])

    _ = await fixture.launch().library()
    #expect(fixture.keepsImage(of: fixture.photo))
    try fixture.removeKeptCopies()
    _ = await fixture.launch().library()
    #expect(!fixture.keepsImage(of: fixture.photo))
    #expect(!fixture.hasDeferredList)
  }

  @Test(
    "a deleted photo's image stays while a kept copy of the index can't be read, even after 30 days, then goes",
    arguments: Deletion.allCases)
  func keepsImagesAnUnreadableCopyMightName(_ deletion: Deletion) async throws {
    defer { fixture.remove() }
    let storage = fixture.launch()
    await storage.save(fixture.photo, for: fixture.word)
    let unreadableCopy = fixture.directory.appending(path: "index.unreadable-1-unread.json")
    try FileManager.default.createDirectory(at: unreadableCopy, withIntermediateDirectories: true)

    await fixture.delete(deletion, of: fixture.photo, from: storage)
    _ = await fixture.launch(onDay: 31).library()
    #expect(fixture.keepsImage(of: fixture.photo))

    try FileManager.default.removeItem(at: unreadableCopy)
    _ = await fixture.launch().library()
    #expect(!fixture.keepsImage(of: fixture.photo))
  }

  @Test("a deleted photo's image goes after 30 days, even while a kept copy names it")
  func removesImagesAfterThirtyDays() async throws {
    defer { fixture.remove() }
    _ = try await fixture.deletedWhileAKeptCopyNamesIt()

    _ = await fixture.launch(onDay: 29).library()
    #expect(fixture.keepsImage(of: fixture.photo))
    _ = await fixture.launch(onDay: 30).library()
    #expect(!fixture.keepsImage(of: fixture.photo))
    #expect(!fixture.hasDeferredList)
  }

  @Test("each photo deleted while a kept copy names it is added to the list, and each goes")
  func recordsEveryDeletion() async throws {
    defer { fixture.remove() }
    _ = try await fixture.deletedWhileAKeptCopyNamesIt([fixture.photo, fixture.otherPhoto])
    await fixture.launch().deleteMedia(fixture.otherPhoto.sha256)
    #expect(fixture.deferredIDs() == [photoID, fixture.otherPhoto.sha256])

    try await expectBothGoOnceNoCopyNamesThem()
  }

  @Test("saving a deleted photo again takes it off the list, and keeps its image")
  func keepsAPhotoSavedAgain() async throws {
    defer { fixture.remove() }
    let storage = try await fixture.deletedWhileAKeptCopyNamesIt()
    #expect(fixture.deferredIDs() == [photoID])

    await storage.save(fixture.photo, for: fixture.word)
    #expect(!fixture.hasDeferredList)
    try fixture.removeKeptCopies()
    _ = await fixture.launch(onDay: 31).library()
    #expect(fixture.keepsImage(of: fixture.photo))
  }

  @Test("a photo saved again stays on the list while its index can't be saved")
  func keepsAPhotoListedUntilItsIndexSaves() async throws {
    defer { fixture.remove() }
    let storage = try await fixture.deletedWhileAKeptCopyNamesIt()
    try fixture.setLocked(true, at: fixture.indexURL)

    await storage.save(fixture.photo, for: fixture.word)

    #expect(fixture.deferredIDs() == [photoID])
  }

  @Test(
    "a photo saved again keeps its image, named by its record or only its encounter, though the list kept its ID",
    arguments: [false, true])
  func keepsImagesTheIndexNamesAgain(onlyByEncounter: Bool) async throws {
    defer { fixture.remove() }
    let storage = try await fixture.deletedWhileAKeptCopyNamesIt()
    try fixture.setLocked(true, at: fixture.deferredURL)
    await storage.save(fixture.photo, for: fixture.word)
    try fixture.setLocked(false, at: fixture.deferredURL)
    #expect(fixture.deferredIDs() == [photoID])
    if onlyByEncounter {
      _ = try fixture.damageIndex(replacing: #""name":"ramen.jpg""#, with: #""nam":"ramen.jpg""#)
    }
    try fixture.removeKeptCopies()

    _ = await fixture.launch(onDay: 31).library()

    #expect(fixture.keepsImage(of: fixture.photo))
    #expect(!fixture.hasDeferredList)
  }

  @Test("a damaged list is kept aside, and the photos it names still go")
  func keepsADamagedListAside() async throws {
    defer { fixture.remove() }
    _ = try await fixture.deletedWhileAKeptCopyNamesIt([fixture.photo, fixture.otherPhoto])
    let damaged = Data("damaged \(photoID) list".utf8)
    try damaged.write(to: fixture.deferredURL)

    await fixture.launch().deleteMedia(fixture.otherPhoto.sha256)

    #expect(fixture.keptCopies(of: fixture.deferredURL) == [damaged])
    #expect(fixture.deferredIDs() == [photoID, fixture.otherPhoto.sha256])
    try await expectBothGoOnceNoCopyNamesThem()
  }

  @Test("a list that can't be read is neither written over nor acted on, and keeps the new photo's image")
  func leavesAListItCantRead() async throws {
    defer { fixture.remove() }
    _ = try await fixture.deletedWhileAKeptCopyNamesIt([fixture.photo, fixture.otherPhoto])
    try fixture.setReadable(false, at: fixture.deferredURL)

    let storage = fixture.launch(onDay: 31)
    _ = await storage.library()
    await storage.deleteMedia(fixture.otherPhoto.sha256)

    try fixture.setReadable(true, at: fixture.deferredURL)
    #expect(fixture.keepsImage(of: fixture.photo))
    #expect(fixture.keepsImage(of: fixture.otherPhoto))
    #expect(fixture.deferredIDs() == [photoID])
    try fixture.removeKeptCopies()
    _ = await fixture.launch().library()
    #expect(!fixture.keepsImage(of: fixture.photo))
  }

  @Test("a list that can't be opened keeps the deleted photo's image, and isn't written over")
  func keepsImagesWhenTheListCantBeOpened() async throws {
    defer { fixture.remove() }
    _ = try await fixture.savedThenDamaged([fixture.photo])
    try FileManager.default.createDirectory(
      at: fixture.deferredURL, withIntermediateDirectories: true)

    await fixture.launch().deleteMedia(photoID)

    #expect(fixture.keepsImage(of: fixture.photo))
    let values = try fixture.deferredURL.resourceValues(forKeys: [.isDirectoryKey])
    #expect(values.isDirectory == true)
  }

  @Test("an image that can't be removed yet stays on the list, and goes at a later launch")
  func retriesImagesItCouldntRemove() async throws {
    defer { fixture.remove() }
    let storage = fixture.launch()
    await storage.save(fixture.photo, for: fixture.word)
    try fixture.setLocked(true, at: fixture.imageURL(of: fixture.photo))

    await storage.deleteMedia(photoID)
    #expect(fixture.deferredIDs() == [photoID])
    _ = await fixture.launch().library()
    #expect(fixture.deferredIDs() == [photoID])

    try fixture.setLocked(false, at: fixture.imageURL(of: fixture.photo))
    _ = await fixture.launch().library()
    #expect(!fixture.keepsImage(of: fixture.photo))
    #expect(!fixture.hasDeferredList)
  }

  @Test("the images that are due go when the app opens, without the Media Library being opened")
  func deletesDueImagesAtLaunch() async throws {
    defer { fixture.remove() }
    _ = try await fixture.deletedWhileAKeptCopyNamesIt()
    try fixture.removeKeptCopies()

    await fixture.launch().deleteImagesDue()

    #expect(!fixture.keepsImage(of: fixture.photo))
    #expect(!fixture.hasDeferredList)
  }

  @Test("an app left open deletes the images that come due, at most once a day")
  func deletesDueImagesOnceADay() async throws {
    defer { fixture.remove() }
    _ = try await fixture.savedThenDamaged([fixture.photo])
    let day = OSAllocatedUnfairLock(initialState: 0.0)
    let storage = fixture.launch(on: day)
    await storage.deleteMedia(photoID)
    try fixture.removeKeptCopies()

    await storage.deleteImagesDue()
    #expect(fixture.keepsImage(of: fixture.photo))
    day.withLock { $0 = 1 }
    await storage.deleteImagesDue()
    #expect(!fixture.keepsImage(of: fixture.photo))
  }

  @Test("a listed name that isn't a photo's ID is dropped, and deletes nothing")
  func dropsNamesThatArentIDs() async throws {
    defer { fixture.remove() }
    await fixture.launch().save(fixture.photo, for: fixture.word)
    let outside = fixture.directory.deletingLastPathComponent()
      .appending(path: "\(UUID().uuidString).image")
    try Data([7]).write(to: outside)
    defer { try? FileManager.default.removeItem(at: outside) }
    let escape = "../\(outside.deletingPathExtension().lastPathComponent)"
    try fixture.writeDeferred([escape: MediaLibraryFixture.firstDay])

    _ = await fixture.launch(onDay: 31).library()

    #expect(FileManager.default.fileExists(atPath: outside.path))
    #expect(!fixture.hasDeferredList)
  }

  @Test("a launch with nothing to delete leaves the list as it is")
  func leavesAnUnchangedList() async throws {
    defer { fixture.remove() }
    _ = try await fixture.deletedWhileAKeptCopyNamesIt()
    let earlier = Date(timeIntervalSince1970: 1_700_000_000)
    try FileManager.default.setAttributes(
      [.modificationDate: earlier], ofItemAtPath: fixture.deferredURL.path)

    _ = await fixture.launch().library()

    let attributes = try FileManager.default.attributesOfItem(atPath: fixture.deferredURL.path)
    #expect(attributes[.modificationDate] as? Date == earlier)
  }

  private func expectBothGoOnceNoCopyNamesThem() async throws {
    try fixture.removeKeptCopies()
    _ = await fixture.launch().library()
    #expect(!fixture.keepsImage(of: fixture.photo))
    #expect(!fixture.keepsImage(of: fixture.otherPhoto))
  }

  @Test("a kept copy names a photo by its whole ID, even where damage touches it")
  func readsWholeIDsFromDamagedCopies() async throws {
    defer { fixture.remove() }
    let storage = fixture.launch()
    await storage.save(fixture.photo, for: fixture.word)
    await storage.save(fixture.otherPhoto, for: fixture.word)
    let damaged = "{\"\(photoID)\"\u{301}:5,\"\(fixture.otherPhoto.sha256.dropLast())\""
    try Data(damaged.utf8).write(
      to: fixture.directory.appending(path: "index.unreadable-1-damaged.json"))

    await storage.deleteMedia(photoID)
    await storage.deleteMedia(fixture.otherPhoto.sha256)

    #expect(fixture.keepsImage(of: fixture.photo))
    #expect(!fixture.keepsImage(of: fixture.otherPhoto))
  }
}
