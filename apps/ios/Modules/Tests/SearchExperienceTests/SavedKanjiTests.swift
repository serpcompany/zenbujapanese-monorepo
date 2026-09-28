import Foundation
import Testing

@testable import SearchExperience

@MainActor
@Suite("Saved kanji")
final class SavedKanjiTests {
  private let directory = FileManager.default.temporaryDirectory
    .appending(path: "saved-kanji-tests-\(UUID().uuidString)", directoryHint: .isDirectory)

  deinit {
    try? FileManager.default.removeItem(at: directory)
  }

  private let sai = SavedItem.kanji(KanjiCharacter("最")!, reading: "サイ")
  private let taberu = LanguageReferenceID(rawValue: "0123456789abcdef0123456789abcdef")

  @Test("a kanji's saved ID names it and never a word")
  func storedID() {
    #expect(sai.storedID == "kanji:最")
    #expect(SavedItem.kanji(storedID: sai.storedID) == KanjiCharacter("最"))
    #expect(SavedItem.kanji(storedID: taberu.rawValue) == nil)
    #expect(sai.noteID.rawValue == sai.storedID)
  }

  @Test("a known kanji survives a reload and stays apart from words")
  func knownKanji() async {
    let fileURL = directory.appending(path: "word-knowledge.json")
    let knowledge = WordKnowledge(fileURL: fileURL)
    await knowledge.flush()
    knowledge.toggleKnown(sai)
    await knowledge.flush()

    let reloaded = WordKnowledge(fileURL: fileURL)
    await reloaded.flush()
    #expect(reloaded.isKnown(sai))
    #expect(!reloaded.isKnown(taberu))
    #expect(reloaded.knownRecords.first?.kanji == KanjiCharacter("最"))
    #expect(reloaded.knownRecords.first?.reading == "サイ")
  }

  @Test("a list holds kanji and words together")
  func listedKanji() async throws {
    let fileURL = directory.appending(path: "word-lists.json")
    let lists = WordLists(fileURL: fileURL)
    await lists.flush()
    let favorites = try #require(lists.lists.first?.id)
    lists.toggle(sai, in: favorites)
    lists.addWord(taberu, headword: "食べる", reading: "たべる", to: favorites)
    await lists.flush()

    let reloaded = WordLists(fileURL: fileURL)
    await reloaded.flush()
    #expect(reloaded.contains(sai, in: favorites))
    #expect(reloaded.contains(taberu, in: favorites))
    #expect(reloaded.words(in: favorites).compactMap(\.kanji) == [KanjiCharacter("最")!])

    reloaded.remove(storedID: sai.storedID, from: favorites)
    #expect(!reloaded.contains(sai, in: favorites))
  }
}
