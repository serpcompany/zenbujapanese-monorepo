import Foundation
import Testing
@testable import SearchExperience

@MainActor
@Suite("Known words")
struct WordKnowledgeTests {
  private let fileURL = FileManager.default.temporaryDirectory
    .appending(path: "word-knowledge-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
    .appending(path: "word-knowledge.json")

  private let taberu = LanguageReferenceID(rawValue: "0123456789abcdef0123456789abcdef")
  private let miru = LanguageReferenceID(rawValue: "fedcba9876543210fedcba9876543210")

  @Test("a word without a record is unknown")
  func defaultsToUnknown() {
    let knowledge = WordKnowledge(fileURL: fileURL)
    #expect(knowledge.status(taberu) == .unknown)
    #expect(knowledge.knownCount == 0)
  }

  @Test("known words survive a reload")
  func persistence() async {
    let knowledge = WordKnowledge(fileURL: fileURL)
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    await knowledge.flush()

    let reloaded = WordKnowledge(fileURL: fileURL)
    #expect(reloaded.isKnown(taberu))
    #expect(reloaded.records[taberu.rawValue]?.headword == "食べる")
    #expect(reloaded.records[taberu.rawValue]?.reading == "たべる")
  }

  @Test("marking a word unknown keeps its record")
  func unknownKeepsRecord() async {
    let knowledge = WordKnowledge(fileURL: fileURL)
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    knowledge.setStatus(.unknown, id: taberu, headword: "食べる", reading: "たべる")
    await knowledge.flush()

    let reloaded = WordKnowledge(fileURL: fileURL)
    #expect(reloaded.status(taberu) == .unknown)
    #expect(reloaded.records[taberu.rawValue]?.status == .unknown)
    #expect(reloaded.knownCount == 0)
    #expect(reloaded.knownRecords.isEmpty)
  }

  @Test("only known words are counted and listed, most recent first")
  func knownRecordsOrder() {
    let knowledge = WordKnowledge(fileURL: fileURL)
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    knowledge.setStatus(.known, id: miru, headword: "見る", reading: "みる")
    #expect(knowledge.knownCount == 2)
    #expect(knowledge.knownRecords.map(\.headword) == ["見る", "食べる"])

    knowledge.setStatus(.unknown, id: miru, headword: "見る", reading: "みる")
    #expect(knowledge.knownCount == 1)
    #expect(knowledge.knownRecords.map(\.headword) == ["食べる"])
  }

  @Test("setting the same status again does not change when it was marked")
  func repeatedStatusIsIgnored() {
    let knowledge = WordKnowledge(fileURL: fileURL)
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    let markedAt = knowledge.records[taberu.rawValue]?.updatedAt
    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    #expect(knowledge.records[taberu.rawValue]?.updatedAt == markedAt)
  }

  @Test("a corrupt file loads as no records")
  func corruptFile() throws {
    try FileManager.default.createDirectory(
      at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    try Data("not json".utf8).write(to: fileURL)

    let knowledge = WordKnowledge(fileURL: fileURL)
    #expect(knowledge.records.isEmpty)
  }
}
