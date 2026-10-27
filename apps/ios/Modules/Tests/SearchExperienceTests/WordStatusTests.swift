import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Word status: Unknown, Learning, and Known")
final class WordStatusTests {
  private let directory = FileManager.default.temporaryDirectory
    .appending(path: "word-status-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
  private var fileURL: URL { directory.appending(path: "word-knowledge.json") }

  deinit {
    try? FileManager.default.removeItem(at: directory)
  }

  private let taberu = LanguageReferenceID(rawValue: "042e07f7052f611fed33ddddf37f55fd")
  private let miru = LanguageReferenceID(rawValue: "7f490a9c9c0da94f4e9474f4efe74be1")
  private let sai = SavedItem.kanji(KanjiCharacter("最")!, reading: "サイ")

  private func loadedKnowledge() async -> WordKnowledge {
    let knowledge = WordKnowledge(fileURL: fileURL)
    await knowledge.flush()
    return knowledge
  }

  @Test("a word or kanji is in one state at a time, listed under it most recent first")
  func oneStateAtATime() async throws {
    let knowledge = await loadedKnowledge()
    knowledge.setStatus(.learning, id: taberu, headword: "食べる", reading: "たべる")
    knowledge.setStatus(.learning, for: sai)
    knowledge.setStatus(.known, id: miru, headword: "見る", reading: "みる")
    #expect(knowledge.marked(.learning).map(\.headword) == ["最", "食べる"])
    #expect(knowledge.marked(.known).map(\.headword) == ["見る"])
    #expect(knowledge.marked(.unknown).isEmpty)

    knowledge.setStatus(.known, id: taberu, headword: "食べる", reading: "たべる")
    #expect(knowledge.status(taberu) == .known)
    #expect(knowledge.marked(.learning).map(\.headword) == ["最"])
    #expect(knowledge.marked(.known).map(\.headword) == ["食べる", "見る"])

    knowledge.setStatus(.unknown, for: sai)
    #expect(knowledge.status(sai) == .unknown)
    #expect(knowledge.marked(.learning).isEmpty)
  }

  @Test("Learning survives a reload, and a word being learned isn't known to reading aids")
  func learningSurvivesAReload() async throws {
    let knowledge = await loadedKnowledge()
    knowledge.setStatus(.learning, id: taberu, headword: "食べる", reading: "たべる")
    knowledge.setStatus(.learning, for: sai)
    await knowledge.flush()

    let reloaded = await loadedKnowledge()
    #expect(reloaded.status(taberu) == .learning)
    #expect(reloaded.status(sai) == .learning)
    #expect(!reloaded.isKnown(taberu))
    #expect(!reloaded.isKnown(sai))
    #expect(reloaded.marked(.learning).map(\.entryID) == [sai.storedID, taberu.rawValue])
    #expect(reloaded.knownRecords.isEmpty)
  }

  @Test("an earlier version's known words load unchanged, and its file isn't rewritten")
  func earlierVersionLoadsUnchanged() async throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let json = """
      {"version":2,"records":[
      {"entryID":"\(taberu.rawValue)","headword":"食べる","reading":"たべる","status":"known","updatedAt":0},
      {"entryID":"\(miru.rawValue)","headword":"見る","reading":"みる","status":"unknown","updatedAt":0}]}
      """
    try Data(json.utf8).write(to: fileURL)

    let knowledge = await loadedKnowledge()
    #expect(knowledge.status(taberu) == .known)
    #expect(knowledge.status(miru) == .unknown)
    #expect(knowledge.marked(.learning).isEmpty)
    #expect(!knowledge.isReadOnly)
    #expect(try Data(contentsOf: fileURL) == Data(json.utf8))
  }

  @Test("each change says the state it left, so undoing it puts that state back")
  func changesSayTheirPreviousState() async throws {
    let knowledge = await loadedKnowledge()
    var told: [KnownWordChange] = []
    knowledge.changeObserver = { change in
      if case .known(let word, let previous) = change { told += [word.with(previous), word] }
    }
    knowledge.setStatus(.learning, for: sai)
    knowledge.setStatus(.known, for: sai)
    #expect(told.map(\.status) == [.unknown, .learning, .learning, .known])
    #expect(told.allSatisfy { $0.storedID == sai.storedID && $0.headword == "最" })
  }

  @Test("each state offers the other two, in the same order everywhere")
  func choicesLeaveOutTheCurrentState() async throws {
    let knowledge = await loadedKnowledge()
    #expect(knowledge.choices(for: sai).map(\.action) == ["mark-known", "mark-learning"])
    knowledge.setStatus(.learning, for: sai)
    #expect(knowledge.choices(for: sai).map(\.action) == ["mark-unknown", "mark-known"])
    #expect(knowledge.choices(for: sai).allSatisfy { $0.isEnabled })
    #expect(KnownWordChoice(.learning, isEnabled: true).systemImage == WordStatusTag.learningSymbol)
  }

  @Test("only Known and Learning have a tag")
  func tags() {
    #expect(WordStatusTag(.known) != nil)
    #expect(WordStatusTag(.learning) != nil)
    #expect(WordStatusTag(.unknown) == nil)
    #expect(WordStatusTag(.unrecognized("mastered")) == nil)
  }

  @Test("a change an earlier version saved reads its known flag, and a change saved now keeps it")
  func earlierChangeFormat() throws {
    let earlier = #"{"storedID":"kanji:語","headword":"語","reading":"ご","known":true}"#
    let read = try JSONDecoder().decode(KnownWordChange.self, from: Data(earlier.utf8))
    #expect(
      read == KnownWordChange(storedID: "kanji:語", headword: "語", reading: "ご", status: .known))

    let saved = try JSONEncoder().encode(read.with(.learning))
    let object = try #require(try JSONSerialization.jsonObject(with: saved) as? [String: Any])
    #expect(object["status"] as? String == "learning")
    #expect(object["known"] as? Bool == false)
    #expect(try JSONDecoder().decode(KnownWordChange.self, from: saved).status == .learning)
  }

  @Test("a synced word reads its state, and falls back to known when the state is missing or new")
  func syncedState() throws {
    let word = { (fields: String) throws -> WordKnowledgeStatus in
      let json = #"{"itemId":"kanji:語","headword":"語","reading":"ご",\#(fields)}"#
      return try JSONDecoder().decode(SyncedKnownWord.self, from: Data(json.utf8)).status
    }
    #expect(try word(#""known":false,"state":"learning""#) == .learning)
    #expect(try word(#""known":true,"state":"known""#) == .known)
    #expect(try word(#""known":true"#) == .known)
    #expect(try word(#""known":false"#) == .unknown)
    #expect(try word(#""known":false,"state":"mastered""#) == .unknown)
  }
}
