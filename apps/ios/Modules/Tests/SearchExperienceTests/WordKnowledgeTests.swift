import Foundation
import Testing
@testable import SearchExperience

@MainActor
@Suite("Known words")
final class WordKnowledgeTests {
  private let directory = FileManager.default.temporaryDirectory
    .appending(path: "word-knowledge-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
  private var fileURL: URL { directory.appending(path: "word-knowledge.json") }

  deinit {
    try? FileManager.default.removeItem(at: directory)
  }

  private let taberu = LanguageReferenceID(rawValue: "0123456789abcdef0123456789abcdef")
  private let miru = LanguageReferenceID(rawValue: "fedcba9876543210fedcba9876543210")

  @Test("a word without a record is unknown")
  func defaultsToUnknown() async {
    let knowledge = WordKnowledge(fileURL: fileURL)
    await knowledge.flush()
    #expect(knowledge.status(taberu) == .unknown)
    #expect(knowledge.knownCount == 0)
  }

  @Test("known words survive a reload")
  func persistence() async {
    let knowledge = WordKnowledge(fileURL: fileURL)
    await knowledge.flush()
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    await knowledge.flush()

    let reloaded = WordKnowledge(fileURL: fileURL)
    await reloaded.flush()
    #expect(reloaded.isKnown(taberu))
    #expect(reloaded.records[taberu.rawValue]?.headword == "食べる")
    #expect(reloaded.records[taberu.rawValue]?.reading == "たべる")
  }

  @Test("marking a word unknown keeps its record")
  func unknownKeepsRecord() async {
    let knowledge = WordKnowledge(fileURL: fileURL)
    await knowledge.flush()
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    knowledge.setStatus(.unknown, id: taberu, headword: "食べる", reading: "たべる")
    await knowledge.flush()

    let reloaded = WordKnowledge(fileURL: fileURL)
    await reloaded.flush()
    #expect(reloaded.status(taberu) == .unknown)
    #expect(reloaded.records[taberu.rawValue]?.status == .unknown)
    #expect(reloaded.knownCount == 0)
    #expect(reloaded.knownRecords.isEmpty)
  }

  @Test("only known words are counted and listed, most recent first")
  func knownRecordsOrder() async {
    let knowledge = WordKnowledge(fileURL: fileURL)
    await knowledge.flush()
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    knowledge.setStatus(.known, id: miru, headword: "見る", reading: "みる")
    #expect(knowledge.knownCount == 2)
    #expect(knowledge.knownRecords.map(\.headword) == ["見る", "食べる"])

    knowledge.setStatus(.unknown, id: miru, headword: "見る", reading: "みる")
    #expect(knowledge.knownCount == 1)
    #expect(knowledge.knownRecords.map(\.headword) == ["食べる"])
  }

  @Test("setting the same status again does not change when it was marked")
  func repeatedStatusIsIgnored() async {
    let knowledge = WordKnowledge(fileURL: fileURL)
    await knowledge.flush()
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    let markedAt = knowledge.records[taberu.rawValue]?.updatedAt
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    #expect(knowledge.records[taberu.rawValue]?.updatedAt == markedAt)
  }

  @Test("a corrupt file loads as no records and is kept beside the new file")
  func corruptFile() async throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try Data("not json".utf8).write(to: fileURL)

    let knowledge = WordKnowledge(fileURL: fileURL)
    await knowledge.flush()
    #expect(knowledge.records.isEmpty)
    #expect(try backups().count == 1)
    let relaunched = WordKnowledge(fileURL: fileURL)
    await relaunched.flush()
    #expect(try backups().count == 1)
  }

  @Test("an unreadable record doesn't discard the rest, and is kept aside only once")
  func unreadableRecord() async throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let json = """
      {"version":1,"records":[
      {"entryID":"\(taberu.rawValue)","headword":"食べる","reading":"たべる","status":"known","updatedAt":0},
      {"entryID":"\(miru.rawValue)","headword":"見る"}]}
      """
    try Data(json.utf8).write(to: fileURL)

    let knowledge = WordKnowledge(fileURL: fileURL)
    await knowledge.flush()
    #expect(knowledge.isLoaded)
    #expect(knowledge.isKnown(taberu))
    #expect(knowledge.records.count == 1)

    let relaunched = WordKnowledge(fileURL: fileURL)
    await relaunched.flush()
    #expect(relaunched.isKnown(taberu))
    #expect(try backups().count == 1)
  }

  @Test("a status from a newer version reads as unknown and is saved back unchanged")
  func unrecognizedStatus() async throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let json = """
      {"version":1,"records":[
      {"entryID":"\(miru.rawValue)","headword":"見る","reading":"みる","status":"learning","updatedAt":0}]}
      """
    try Data(json.utf8).write(to: fileURL)

    let knowledge = WordKnowledge(fileURL: fileURL)
    await knowledge.flush()
    #expect(!knowledge.isKnown(miru))
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    await knowledge.flush()

    let reloaded = WordKnowledge(fileURL: fileURL)
    await reloaded.flush()
    #expect(reloaded.records[miru.rawValue]?.status == .unrecognized("learning"))
    #expect(reloaded.isKnown(taberu))
    #expect(try backups().isEmpty)
  }

  @Test("rapid changes all reach the file")
  func rapidChanges() async {
    let knowledge = WordKnowledge(fileURL: fileURL)
    await knowledge.flush()
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    knowledge.setStatus(.known, id: miru, headword: "見る", reading: "みる")
    knowledge.setStatus(.unknown, id: taberu, headword: "食べる", reading: "たべる")
    await knowledge.flush()

    let reloaded = WordKnowledge(fileURL: fileURL)
    await reloaded.flush()
    #expect(!reloaded.isKnown(taberu))
    #expect(reloaded.isKnown(miru))
  }

  @Test("changes made before the file loads are ignored")
  func changesBeforeLoad() async {
    let knowledge = WordKnowledge(fileURL: fileURL)
    #expect(!knowledge.isLoaded)
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    #expect(!knowledge.isKnown(taberu))
    await knowledge.flush()
    #expect(knowledge.isLoaded)
    #expect(!knowledge.isKnown(taberu))
  }

  @Test("a failed write is saved again by saveIfNeeded")
  func retryAfterFailedWrite() async throws {
    let knowledge = WordKnowledge(fileURL: fileURL)
    await knowledge.flush()
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try setDirectoryWritable(false)
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    await knowledge.flush()
    #expect(!FileManager.default.fileExists(atPath: fileURL.path))

    try setDirectoryWritable(true)
    knowledge.saveIfNeeded()
    await knowledge.flush()
    let reloaded = WordKnowledge(fileURL: fileURL)
    await reloaded.flush()
    #expect(reloaded.isKnown(taberu))
  }

  @Test("a file from a newer version is never saved over")
  func newerVersionIsReadOnly() async throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let json = """
      {"version":2,"records":[
      {"entryID":"\(taberu.rawValue)","headword":"食べる","reading":"たべる","status":"known","updatedAt":0,"gloss":"eat"}]}
      """
    try Data(json.utf8).write(to: fileURL)

    let knowledge = WordKnowledge(fileURL: fileURL)
    await knowledge.flush()
    #expect(knowledge.isKnown(taberu))
    knowledge.setStatus(.known, id: miru, headword: "見る", reading: "みる")
    await knowledge.flush()
    #expect(try Data(contentsOf: fileURL) == Data(json.utf8))
  }

  private func setDirectoryWritable(_ writable: Bool) throws {
    try FileManager.default.setAttributes(
      [.posixPermissions: writable ? 0o755 : 0o555], ofItemAtPath: directory.path)
  }

  private func backups() throws -> [String] {
    try FileManager.default.contentsOfDirectory(atPath: directory.path)
      .filter { $0.hasPrefix("word-knowledge.unreadable-") }
  }
}
