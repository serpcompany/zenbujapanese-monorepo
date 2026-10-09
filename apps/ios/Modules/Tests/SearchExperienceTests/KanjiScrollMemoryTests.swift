import Testing

@testable import SearchExperience

@Suite("Kanji pages remember where they were scrolled")
struct KanjiScrollMemoryTests {
  private let kanji = KanjiCharacter("見")!
  private let element = KanjiElementID("目")!
  private let word = DictionaryEntry.fixture(id: "miru", headword: "見る")

  @Test("a word opened from a kanji is remembered, and replaces its element")
  func wordFromKanji() {
    var memory = KanjiScrollMemory()
    memory.remember(leaving: .kanji(kanji, nil), for: .kanjiElement(element))
    memory.remember(leaving: .kanji(kanji, nil), for: .word(word, nil))
    #expect(memory.wordIDs[kanji] == word.id)
    #expect(memory.elementIDs[kanji] == nil)
  }

  @Test("an element opened from a kanji is remembered, and replaces its word")
  func elementFromKanji() {
    var memory = KanjiScrollMemory()
    memory.remember(leaving: .kanji(kanji, nil), for: .word(word, nil))
    memory.remember(leaving: .kanji(kanji, nil), for: .kanjiElement(element))
    #expect(memory.elementIDs[kanji] == element)
    #expect(memory.wordIDs[kanji] == nil)
  }

  @Test("opening a kanji again forgets its word, and an element remembers the kanji it opened")
  func kanjiOpenedAgain() {
    var memory = KanjiScrollMemory()
    memory.remember(leaving: .kanji(kanji, nil), for: .word(word, nil))
    memory.remember(leaving: .kanjiElement(element), for: .kanji(kanji, nil))
    #expect(memory.contributions[element] == kanji)
    #expect(memory.wordIDs[kanji] == nil)
    memory.remember(leaving: .kanji(kanji, nil), for: .word(word, nil))
    memory.remember(leaving: .word(word, nil), for: .kanji(kanji, nil))
    #expect(memory.wordIDs[kanji] == nil)
  }
}
