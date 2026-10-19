import CryptoKit
import Foundation
import Testing

@testable import SearchExperience

@Suite("Tokenizer files the share sheet maps")
final class TokenizerFilesTests {
  private let folder = URL.temporaryDirectory.appending(
    path: "tokenizer-files-\(UUID().uuidString)", directoryHint: .isDirectory)

  deinit {
    try? FileManager.default.removeItem(at: folder)
  }

  private static func digest(_ bytes: InflatedBytes) -> String {
    SHA256.hash(data: UnsafeRawBufferPointer(start: bytes.pointer, count: bytes.count))
      .map { String(format: "%02x", $0) }.joined()
  }

  private func unpackedFiles() -> [String] {
    ((try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? []).sorted()
  }

  @Test(
    "maps the same bytes the app unpacks in memory",
    arguments: ["unk_char", "unk", "cc"])
  func mapsWhatTheAppUnpacks(file: String) throws {
    let mapped = try #require(TokenizerFiles.mapped(unpackingInto: folder)(file))
    defer { mapped.release() }
    let inflated = try #require(TokenizerDictionary.unpacked(file))
    defer { inflated.release() }
    #expect(mapped.isMapped)
    #expect(mapped.count == inflated.count)
    #expect(Self.digest(mapped) == Self.digest(inflated))
  }

  @Test("unpacks a file once, and again only when it is cut short")
  func unpacksOnce() throws {
    let map = TokenizerFiles.mapped(unpackingInto: folder)
    try #require(map("unk_invoke")).release()
    let name = try #require(unpackedFiles().first)
    let file = folder.appending(path: name)
    let written = try FileManager.default.attributesOfItem(atPath: file.path)[.modificationDate]
    try #require(map("unk_invoke")).release()
    #expect(
      try FileManager.default.attributesOfItem(atPath: file.path)[.modificationDate] as? Date
        == written as? Date)

    let handle = try FileHandle(forWritingTo: file)
    try handle.truncate(atOffset: 10)
    try handle.close()
    let again = try #require(map("unk_invoke"))
    defer { again.release() }
    #expect(again.count == 1_048_576)
    #expect(TokenizerFiles.size(of: file) == 1_048_576)
  }

  @Test("removes the unpacked file of an earlier dictionary")
  func removesEarlierVersions() throws {
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let earlier = folder.appending(path: "unk_map-deadbeef-16.dat")
    try Data(count: 16).write(to: earlier)
    try #require(TokenizerFiles.mapped(unpackingInto: folder)("unk_map")).release()
    #expect(unpackedFiles().count == 1)
    #expect(!unpackedFiles().contains(earlier.lastPathComponent))
  }

  @Test("maps only the tokenizer's own files")
  func onlyTheTokenizersFiles() {
    let map = TokenizerFiles.mapped(unpackingInto: folder)
    #expect(map("kuromoji") == nil)
    #expect(map("../LanguageReferenceData") == nil)
    #expect(unpackedFiles().isEmpty)
  }

  @Test("refuses to unpack a file that is cut short or altered")
  func refusesBrokenFiles() throws {
    let whole = try TokenizerDictionaryTests.packed("unk_char.dat.gz")
    var altered = whole
    altered[whole.count / 2] ^= 0xff
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    for broken in [whole.prefix(whole.count / 2), altered, TokenizerDictionaryTests.emptyGzip] {
      let path = folder.appending(path: UUID().uuidString).path
      let descriptor = open(path, O_CREAT | O_WRONLY, 0o600)
      defer { close(descriptor) }
      #expect(!Gunzip.unpack(broken, to: descriptor))
    }
  }
}
