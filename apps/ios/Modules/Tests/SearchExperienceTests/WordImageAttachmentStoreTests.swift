import Foundation
import XCTest

@testable import SearchExperience

final class WordImageAttachmentStoreTests: XCTestCase {
  func testFileBackedStorePersistsDeduplicatesAndRemovesOrphanedBlob() async throws {
    let directory = FileManager.default.temporaryDirectory
      .appending(path: "word-image-store-\(UUID().uuidString)", directoryHint: .isDirectory)
    defer { try? FileManager.default.removeItem(at: directory) }
    let firstID = WordNoteID(rawValue: "word:first")
    let secondID = WordNoteID(rawValue: "word:second")
    let attachment = WordImageAttachment(name: "encounter.png", data: Data([1, 2, 3, 4]))

    let store = WordImageAttachmentStore.fileBacked(directory: directory)
    await store.save(attachment, firstID)
    await store.save(attachment, secondID)

    let restarted = WordImageAttachmentStore.fileBacked(directory: directory)
    let firstLoaded = await restarted.load(firstID)
    let secondLoaded = await restarted.load(secondID)
    XCTAssertEqual(firstLoaded, attachment)
    XCTAssertEqual(secondLoaded, attachment)
    XCTAssertEqual(try blobCount(in: directory), 1)

    let replacement = WordImageAttachment(name: "later.jpg", data: Data([5, 6, 7]))
    await restarted.save(replacement, firstID)
    let firstReplaced = await restarted.load(firstID)
    let secondRetained = await restarted.load(secondID)
    XCTAssertEqual(firstReplaced, replacement)
    XCTAssertEqual(secondRetained, attachment)
    XCTAssertEqual(try blobCount(in: directory), 2)

    await restarted.remove(secondID)
    let firstStillRetained = await restarted.load(firstID)
    let secondRemoved = await restarted.load(secondID)
    XCTAssertEqual(firstStillRetained, replacement)
    XCTAssertNil(secondRemoved)
    XCTAssertEqual(try blobCount(in: directory), 1)

    await restarted.remove(firstID)
    let firstRemoved = await restarted.load(firstID)
    XCTAssertNil(firstRemoved)
    XCTAssertEqual(try blobCount(in: directory), 0)
  }

  private func blobCount(in directory: URL) throws -> Int {
    try FileManager.default.contentsOfDirectory(
      at: directory,
      includingPropertiesForKeys: nil
    ).count { $0.pathExtension == "image" }
  }
}
