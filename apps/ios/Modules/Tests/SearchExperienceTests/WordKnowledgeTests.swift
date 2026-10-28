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

  private func loadedKnowledge() async -> WordKnowledge {
    let knowledge = WordKnowledge(fileURL: fileURL)
    await knowledge.flush()
    return knowledge
  }

  @Test("a word without a record is unknown")
  func defaultsToUnknown() async {
    let knowledge = await loadedKnowledge()
    #expect(knowledge.status(taberu) == .unknown)
    #expect(knowledge.marked(.known).count == 0)
  }

  @Test("known words survive a reload")
  func persistence() async {
    let knowledge = await loadedKnowledge()
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    await knowledge.flush()

    let reloaded = await loadedKnowledge()
    #expect(reloaded.isKnown(taberu))
    #expect(reloaded.records[taberu.rawValue]?.headword == "食べる")
    #expect(reloaded.records[taberu.rawValue]?.reading == "たべる")
  }

  @Test("marking a word unknown keeps its record")
  func unknownKeepsRecord() async {
    let knowledge = await loadedKnowledge()
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    knowledge.setStatus(.unknown, id: taberu, headword: "食べる", reading: "たべる")
    await knowledge.flush()

    let reloaded = await loadedKnowledge()
    #expect(reloaded.status(taberu) == .unknown)
    #expect(reloaded.records[taberu.rawValue]?.status == .unknown)
    #expect(reloaded.marked(.known).count == 0)
    #expect(reloaded.knownRecords.isEmpty)
  }

  @Test("only known words are counted and listed, most recent first")
  func knownRecordsOrder() async {
    let knowledge = await loadedKnowledge()
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    knowledge.setStatus(.known, id: miru, headword: "見る", reading: "みる")
    #expect(knowledge.marked(.known).count == 2)
    #expect(knowledge.knownRecords.map(\.headword) == ["見る", "食べる"])

    knowledge.setStatus(.unknown, id: miru, headword: "見る", reading: "みる")
    #expect(knowledge.marked(.known).count == 1)
    #expect(knowledge.knownRecords.map(\.headword) == ["食べる"])
  }

  @Test("a word changed earlier but applied later is listed by its own time, as after a reload")
  func earlierChangeListedByItsTime() async {
    let knowledge = await loadedKnowledge()
    let morning = Date(timeIntervalSince1970: 1_793_098_800)
    knowledge.now = { morning.addingTimeInterval(3600) }
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    knowledge.setStatus(.known, id: miru, headword: "見る", reading: "みる", at: morning)
    await knowledge.flush()

    #expect(knowledge.records[miru.rawValue]?.updatedAt == morning)
    #expect(knowledge.knownRecords.map(\.headword) == ["食べる", "見る"])
    let reloaded = await loadedKnowledge()
    #expect(reloaded.knownRecords.map(\.headword) == ["食べる", "見る"])
  }

  @Test("setting the same status again does not change when it was marked")
  func repeatedStatusIsIgnored() async {
    let knowledge = await loadedKnowledge()
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    let markedAt = knowledge.records[taberu.rawValue]?.updatedAt
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    #expect(knowledge.records[taberu.rawValue]?.updatedAt == markedAt)
  }

  @Test("a corrupt file loads as no records and is kept beside the new file")
  func corruptFile() async throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try Data("not json".utf8).write(to: fileURL)

    let knowledge = await loadedKnowledge()
    #expect(knowledge.records.isEmpty)
    #expect(try backups().count == 1)
    _ = await loadedKnowledge()
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

    let knowledge = await loadedKnowledge()
    #expect(knowledge.isLoaded)
    #expect(knowledge.isKnown(taberu))
    #expect(knowledge.records.count == 1)

    let relaunched = await loadedKnowledge()
    #expect(relaunched.isKnown(taberu))
    #expect(try backups().count == 1)
  }

  @Test("a status from a newer version reads as unknown and is saved back unchanged")
  func unrecognizedStatus() async throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let json = """
      {"version":1,"records":[
      {"entryID":"\(miru.rawValue)","headword":"見る","reading":"みる","status":"mastered","updatedAt":0}]}
      """
    try Data(json.utf8).write(to: fileURL)

    let knowledge = await loadedKnowledge()
    #expect(!knowledge.isKnown(miru))
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    await knowledge.flush()

    let reloaded = await loadedKnowledge()
    #expect(reloaded.records[miru.rawValue]?.status == .unrecognized("mastered"))
    #expect(reloaded.isKnown(taberu))
    #expect(try backups().isEmpty)
  }

  @Test("rapid changes all reach the file")
  func rapidChanges() async {
    let knowledge = await loadedKnowledge()
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    knowledge.setStatus(.known, id: miru, headword: "見る", reading: "みる")
    knowledge.setStatus(.unknown, id: taberu, headword: "食べる", reading: "たべる")
    await knowledge.flush()

    let reloaded = await loadedKnowledge()
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
    let knowledge = await loadedKnowledge()
    try Data().write(to: directory)
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    await knowledge.flush()
    #expect(!FileManager.default.fileExists(atPath: fileURL.path))

    try FileManager.default.removeItem(at: directory)
    knowledge.saveIfNeeded()
    await knowledge.flush()
    let reloaded = await loadedKnowledge()
    #expect(reloaded.isKnown(taberu))
  }

  private var newerVersionJSON: String {
    """
    {"version":3,"records":[
    {"entryID":"\(taberu.rawValue)","headword":"食べる","reading":"たべる","status":"known","updatedAt":0,"gloss":"eat"}]}
    """
  }

  private func newerVersionKnowledge() async throws -> WordKnowledge {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try Data(newerVersionJSON.utf8).write(to: fileURL)
    return await loadedKnowledge()
  }

  @Test("a file from a newer version is never saved over")
  func newerVersionIsReadOnly() async throws {
    let json = newerVersionJSON
    let knowledge = try await newerVersionKnowledge()
    #expect(knowledge.isKnown(taberu))
    #expect(knowledge.readOnlyReason == .newerVersion)
    knowledge.setStatus(.known, id: miru, headword: "見る", reading: "みる")
    #expect(!knowledge.isKnown(miru))
    await knowledge.flush()
    #expect(try Data(contentsOf: fileURL) == Data(json.utf8))
  }

  @Test("a known word offers Unknown and Learning, or one disabled choice while it can't change")
  func knownWordChoice() async throws {
    let writable = await loadedKnowledge()
    writable.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    let item = try #require(writable.knownRecords.first).item
    #expect(
      writable.choices(for: item)
        == [KnownWordChoice(.unknown, isEnabled: true), KnownWordChoice(.learning, isEnabled: true)])
    #expect(writable.choices(for: item).map(\.action) == ["mark-unknown", "mark-learning"])
    await writable.flush()

    let knowledge = try await newerVersionKnowledge()
    let readOnly = try #require(knowledge.knownRecords.first).item
    #expect(knowledge.choices(for: readOnly) == [.cantChange])
    #expect(!KnownWordChoice.cantChange.isEnabled)
    knowledge.setStatus(.unknown, for: readOnly)
    #expect(knowledge.isKnown(readOnly))
  }

  @Test("a newer file with a different layout is left unchanged")
  func newerVersionWithUnknownLayout() async throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let json = """
      {"version":3,"entries":[{"id":"\(taberu.rawValue)","status":"known"}]}
      """
    try Data(json.utf8).write(to: fileURL)

    let knowledge = await loadedKnowledge()
    #expect(knowledge.readOnlyReason == .newerVersion)
    #expect(knowledge.records.isEmpty)
    knowledge.setStatus(.known, id: miru, headword: "見る", reading: "みる")
    await knowledge.flush()
    #expect(try Data(contentsOf: fileURL) == Data(json.utf8))
    #expect(try backups().isEmpty)
  }

  @Test("a version that isn't a whole number counts as newer")
  func nonIntegerVersionIsNewer() async throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let json = """
      {"version":"2.0","records":[
      {"entryID":"\(taberu.rawValue)","headword":"食べる","reading":"たべる","status":"known","updatedAt":0}]}
      """
    try Data(json.utf8).write(to: fileURL)

    let knowledge = await loadedKnowledge()
    #expect(knowledge.readOnlyReason == .newerVersion)
    #expect(knowledge.isKnown(taberu))
    #expect(try Data(contentsOf: fileURL) == Data(json.utf8))
    #expect(try backups().isEmpty)
  }

  @Test("an unreadable file that can't be kept aside is never saved over")
  func couldNotKeepCopy() async throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try Data("not json".utf8).write(to: fileURL)
    try setDirectoryLocked(true)
    defer { try? setDirectoryLocked(false) }

    let knowledge = await loadedKnowledge()
    #expect(knowledge.readOnlyReason == .couldNotKeepCopy)
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    #expect(!knowledge.isKnown(taberu))
    try setDirectoryLocked(false)
    #expect(try Data(contentsOf: fileURL) == Data("not json".utf8))
    #expect(try backups().isEmpty)
  }

  @Test("unreadable files kept in quick succession are all kept, up to the newest 3")
  func backupsArePruned() async throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    for number in 0..<4 {
      try Data("not json \(number)".utf8).write(to: fileURL)
      let knowledge = await loadedKnowledge()
      #expect(!knowledge.isReadOnly)
    }
    #expect(try backups().count == 3)
  }

  private func setDirectoryLocked(_ locked: Bool) throws {
    try FileManager.default.setAttributes([.immutable: locked], ofItemAtPath: directory.path)
  }

  private func backups() throws -> [String] {
    try FileManager.default.contentsOfDirectory(atPath: directory.path)
      .filter { $0.hasPrefix("word-knowledge.unreadable-") }
  }
}
