import Foundation
import Testing

@testable import SearchExperience

@Suite("Words Zenbu tells Siri about")
@MainActor
struct SiriWordsTests {
  private let favorites = UUID()
  private let verbs = UUID()

  private func listed(_ headword: String, _ reading: String, in list: UUID, at second: Double)
    -> WordListMembership
  {
    WordListMembership(
      listID: list, entryID: headword, headword: headword, reading: reading,
      addedAt: Date(timeIntervalSince1970: second))
  }

  private func known(_ headword: String, _ reading: String) -> WordKnowledgeRecord {
    WordKnowledgeRecord(
      entryID: headword, headword: headword, reading: reading, status: .known,
      updatedAt: Date(timeIntervalSince1970: 0))
  }

  @Test("recent searches come first, then list words newest first across lists, then known words")
  func learnerWords() {
    let gathered = LearnerWord.gathered(
      recentSearches: [SearchQuery("eat"), SearchQuery("見る")],
      lists: [
        [listed("飲む", "のむ", in: favorites, at: 1), listed("kanji:食", "しょく", in: favorites, at: 3)],
        [listed("行く", "いく", in: verbs, at: 2)],
      ],
      known: [known("行く", "いく"), known("猫", "ねこ"), known("note", "")])
    #expect(
      gathered == [
        LearnerWord(written: "eat", reading: nil), LearnerWord(written: "見る", reading: nil),
        LearnerWord(written: "行く", reading: "いく"), LearnerWord(written: "飲む", reading: "のむ"),
        LearnerWord(written: "猫", reading: "ねこ"), LearnerWord(written: "note", reading: nil),
      ])
  }

  @Test("on the bundled dictionary, the learner's words lead and common JLPT words fill the rest")
  func bundledWords() async throws {
    let words = try await SiriWordData().words(
      for: [
        LearnerWord(written: "見る", reading: "みる"), LearnerWord(written: "Eat", reading: nil),
        LearnerWord(written: "食べる", reading: nil),
      ],
      limit: 40)
    #expect(
      Array(words.prefix(3)) == [
        SiriWord(spoken: "miru", written: "見る"), SiriWord(spoken: "eat", written: "Eat"),
        SiriWord(spoken: "taberu", written: "食べる"),
      ])
    #expect(words.count == 40)
    #expect(Set(words.map(\.spoken)).count == words.count)
    #expect(words.dropFirst(3).contains(SiriWord(spoken: "suru", written: "する")))
  }

  @Test("a word is spoken in romaji and shows its Japanese, and comes back from its ID")
  func entity() throws {
    let taberu = SiriWord(spoken: "taberu", written: "食べる")
    #expect(taberu.shownWritten == "食べる")
    #expect(SiriWord(spoken: "eat", written: "eat").shownWritten == nil)
    #expect(SiriWord(id: taberu.id) == taberu)
    #expect(SiriWord(id: "eat\nto eat\nfood") == SiriWord(spoken: "eat", written: "to eat\nfood"))
    #expect(SiriWord(id: "taberu") == nil)
  }

  @Test("Siri relearns the list only when it changes, and keeps it when the core can't answer")
  func registers() async throws {
    let suite = "SiriWordsTests-\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let answered = Answers([
      [SiriWord(spoken: "taberu", written: "食べる")],
      [SiriWord(spoken: "taberu", written: "食べる")],
      nil,
      [SiriWord(spoken: "miru", written: "見る")],
    ])
    let list = SiriWordList(
      sources: SiriWordList.Sources(
        learnerWords: { [] },
        siriWords: { _, _ in
          guard let words = await answered.next() else { throw DictionaryCoreError.bundleUnavailable }
          return words
        },
        watchLearnerWords: { _ in }),
      defaults: defaults)
    var registered = 0
    list.changed = { registered += 1 }
    for expected in [1, 1, 1, 2] {
      await list.refresh()
      #expect(registered == expected)
    }
    #expect(list.words == [SiriWord(spoken: "miru", written: "見る")])
    let relaunched = SiriWordList(sources: .live, defaults: defaults)
    #expect(relaunched.words == list.words)
  }
}

private actor Answers {
  private var answers: [[SiriWord]?]

  init(_ answers: [[SiriWord]?]) {
    self.answers = answers
  }

  func next() -> [SiriWord]? { answers.isEmpty ? nil : answers.removeFirst() }
}
