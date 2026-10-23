import Foundation
import Testing

@testable import SearchExperience

@Suite("Notes on a word or kanji the dictionary no longer has")
struct DroppedWordNotesTests {
  private let word = SavedItemID(rawValue: String(repeating: "f", count: 32))
  private let kanji = SavedItemID(rawValue: "kanji:丢")
  private let onWord = LearnerWordNote(id: "1", text: "辞書から消えた語")
  private let onKanji = LearnerWordNote(id: "2", text: "辞書にない漢字")

  @Test(
    "a note on a word or kanji this dictionary doesn't have is kept and listed as without a word until it's deleted, and one on a word or kanji it has isn't"
  )
  func listsNotesOnDroppedWordsAndKanji() async throws {
    let defaults = MemoryDefaults()
    let stored: [String: [LearnerWordNote]] = [
      word.rawValue: [onWord],
      kanji.rawValue: [onKanji],
      "042e07f7052f611fed33ddddf37f55fd": [LearnerWordNote(id: "3", text: "毎日食べる")],
      "kanji:食": [LearnerWordNote(id: "4", text: "食べ物の食")],
    ]
    defaults.set(try JSONEncoder().encode(stored), forKey: WordNoteStorage.storageKey)
    let listed = [
      NoteWithoutAWord(key: word, note: onWord), NoteWithoutAWord(key: kanji, note: onKanji),
    ]

    let first = launch(in: defaults)

    #expect(await first.withoutAWord() == listed)
    let relaunched = launch(in: defaults)
    #expect(await relaunched.withoutAWord() == listed)
    #expect(await relaunched.load(word).map(\.text) == [onWord.text])
    await relaunched.save(LearnerWordNote(id: onWord.id, text: ""), for: word)
    #expect(await relaunched.withoutAWord() == [NoteWithoutAWord(key: kanji, note: onKanji)])
  }

  private func launch(in defaults: MemoryDefaults) -> WordNoteStorage {
    WordNoteStorage(defaults: defaults.opened(), placing: .live)
  }
}
