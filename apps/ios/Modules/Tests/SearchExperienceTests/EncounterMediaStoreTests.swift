import Foundation
import ImageIO
import UIKit
import UniformTypeIdentifiers
import XCTest

@testable import SearchExperience

final class EncounterMediaStoreTests: XCTestCase {
  func testEncounterMediaStorePersistsManyImagesAndSharesMediaAcrossWords() async throws {
    let directory = FileManager.default.temporaryDirectory
      .appending(path: "word-image-store-\(UUID().uuidString)", directoryHint: .isDirectory)
    defer { try? FileManager.default.removeItem(at: directory) }
    let firstWord = EncounterWordReference(
      id: WordNoteID(rawValue: "word:first"), headword: "女らしい", reading: "おんならしい")
    let secondWord = EncounterWordReference(
      id: WordNoteID(rawValue: "word:second"), headword: "女性", reading: "じょせい")
    let cameraFixture = try normalizedCameraFixture()
    try assertCameraMetadataWasRemoved(cameraFixture)
    let attachment = EncounterMediaAttachment(
      name: cameraFixture.asset.name,
      data: cameraFixture.asset.data
    )
    let replacement = EncounterMediaAttachment(name: "later.jpg", data: Data([5, 6, 7]))

    let store = EncounterMediaStore.fileBacked(directory: directory)
    await store.save(attachment, firstWord)
    await store.save(replacement, firstWord)
    await store.save(replacement, firstWord)
    await store.save(attachment, secondWord)

    let restarted = EncounterMediaStore.fileBacked(directory: directory)
    let firstLoaded = await restarted.encounters(firstWord)
    let secondLoaded = await restarted.encounters(secondWord)
    XCTAssertEqual(firstLoaded.map(\.data), [replacement.data, attachment.data])
    XCTAssertEqual(secondLoaded.map(\.data), [attachment.data])
    XCTAssertEqual(try blobCount(in: directory), 2)

    let library = await restarted.library()
    XCTAssertEqual(library.count, 2)
    let shared = try XCTUnwrap(library.first { $0.id == attachment.sha256 })
    XCTAssertEqual(shared.words, [firstWord, secondWord])
    let sharedMedia = await restarted.media(shared.id)
    XCTAssertEqual(sharedMedia?.data, attachment.data)

    await restarted.remove(firstWord, attachment.sha256)
    let firstAfterRemoval = await restarted.encounters(firstWord)
    let secondAfterRemoval = await restarted.encounters(secondWord)
    XCTAssertEqual(firstAfterRemoval.map(\.data), [replacement.data])
    XCTAssertEqual(secondAfterRemoval.map(\.data), [attachment.data])
    XCTAssertEqual(try blobCount(in: directory), 2)

    await restarted.deleteMedia(attachment.sha256)
    let secondAfterMediaDeletion = await restarted.encounters(secondWord)
    XCTAssertTrue(secondAfterMediaDeletion.isEmpty)
    XCTAssertEqual(try blobCount(in: directory), 1)
    await restarted.remove(firstWord, replacement.sha256)
    let firstAfterAllRemoval = await restarted.encounters(firstWord)
    XCTAssertTrue(firstAfterAllRemoval.isEmpty)
    XCTAssertEqual(try blobCount(in: directory), 0)
  }

  func testEncounterMediaStoreMigratesTheSingleImageIndexWithoutLosingTheWordLink() async throws {
    let root = FileManager.default.temporaryDirectory
      .appending(
        path: "encounter-media-migration-\(UUID().uuidString)", directoryHint: .isDirectory)
    let legacyDirectory = root.appending(path: "Word Image Attachments")
    let directory = root.appending(path: "Encounter Media")
    defer { try? FileManager.default.removeItem(at: root) }
    try FileManager.default.createDirectory(
      at: legacyDirectory, withIntermediateDirectories: true)
    let word = EncounterWordReference(
      id: WordNoteID(rawValue: "word:legacy"), headword: "静か", reading: "しずか")
    let attachment = EncounterMediaAttachment(name: "legacy.png", data: Data([9, 8, 7]))
    let legacyIndex = #"{"word:legacy":{"name":"legacy.png","blobID":"\#(attachment.sha256)"}}"#
    try Data(legacyIndex.utf8).write(to: legacyDirectory.appending(path: "index.json"))
    try attachment.data.write(to: legacyDirectory.appending(path: "\(attachment.sha256).image"))

    let store = EncounterMediaStore.fileBacked(
      directory: directory,
      legacyDirectory: legacyDirectory
    )
    let migrated = await store.encounters(word)

    XCTAssertEqual(migrated.map(\.data), [attachment.data])
    let library = await store.library()
    XCTAssertEqual(library.count, 1)
    XCTAssertEqual(library.first?.words, [word])
    XCTAssertTrue(FileManager.default.fileExists(atPath: directory.path))
    XCTAssertFalse(FileManager.default.fileExists(atPath: legacyDirectory.path))
  }

  private func blobCount(in directory: URL) throws -> Int {
    try FileManager.default.contentsOfDirectory(
      at: directory,
      includingPropertiesForKeys: nil
    ).count { $0.pathExtension == "image" }
  }

  private func normalizedCameraFixture() throws -> (source: Data, asset: ImageTextAsset) {
    let image = UIGraphicsImageRenderer(size: CGSize(width: 1_400, height: 1_000)).image {
      context in
      UIColor.systemRed.setFill()
      context.fill(CGRect(x: 0, y: 0, width: 1_400, height: 1_000))
    }
    let source = NSMutableData()
    let destination = try XCTUnwrap(
      CGImageDestinationCreateWithData(
        source,
        UTType.jpeg.identifier as CFString,
        1,
        nil
      )
    )
    let properties: [CFString: Any] = [
      kCGImagePropertyGPSDictionary: [
        kCGImagePropertyGPSLatitude: 35.6812,
        kCGImagePropertyGPSLatitudeRef: "N",
        kCGImagePropertyGPSLongitude: 139.7671,
        kCGImagePropertyGPSLongitudeRef: "E",
      ],
      kCGImagePropertyTIFFDictionary: [
        kCGImagePropertyTIFFMake: "External Fixture Camera",
        kCGImagePropertyTIFFModel: "Issue 238",
      ],
    ]
    CGImageDestinationAddImage(
      destination,
      try XCTUnwrap(image.cgImage),
      properties as CFDictionary
    )
    XCTAssertTrue(CGImageDestinationFinalize(destination))
    let sourceData = source as Data
    let cameraImage = try XCTUnwrap(UIImage(data: sourceData))
    let asset = try XCTUnwrap(ImageTextAsset(cameraImage: cameraImage))
    return (sourceData, asset)
  }

  private func assertCameraMetadataWasRemoved(
    _ fixture: (source: Data, asset: ImageTextAsset)
  ) throws {
    let source = try XCTUnwrap(CGImageSourceCreateWithData(fixture.source as CFData, nil))
    let sourceProperties = try XCTUnwrap(
      CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
    )
    XCTAssertNotNil(sourceProperties[kCGImagePropertyGPSDictionary])
    let sourceTIFF = try XCTUnwrap(
      sourceProperties[kCGImagePropertyTIFFDictionary] as? [CFString: Any]
    )
    XCTAssertEqual(sourceTIFF[kCGImagePropertyTIFFMake] as? String, "External Fixture Camera")

    let normalized = try XCTUnwrap(
      CGImageSourceCreateWithData(fixture.asset.data as CFData, nil)
    )
    XCTAssertEqual(CGImageSourceGetType(normalized) as String?, UTType.jpeg.identifier)
    let normalizedProperties = try XCTUnwrap(
      CGImageSourceCopyPropertiesAtIndex(normalized, 0, nil) as? [CFString: Any]
    )
    XCTAssertNil(normalizedProperties[kCGImagePropertyGPSDictionary])
    let normalizedTIFF = normalizedProperties[kCGImagePropertyTIFFDictionary] as? [CFString: Any]
    XCTAssertNil(normalizedTIFF?[kCGImagePropertyTIFFMake])
    XCTAssertNil(normalizedTIFF?[kCGImagePropertyTIFFModel])
    XCTAssertEqual(normalizedProperties[kCGImagePropertyOrientation] as? Int ?? 1, 1)
    XCTAssertLessThanOrEqual(
      normalizedProperties[kCGImagePropertyPixelWidth] as? Int ?? .max, 4_096)
    XCTAssertLessThanOrEqual(
      normalizedProperties[kCGImagePropertyPixelHeight] as? Int ?? .max,
      4_096
    )
  }
}
