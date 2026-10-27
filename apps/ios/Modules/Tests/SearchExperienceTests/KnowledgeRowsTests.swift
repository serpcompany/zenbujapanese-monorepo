import Foundation
import Testing

@testable import SearchExperience

@Suite("Known Words rows")
struct KnowledgeRowsTests {
  private static let miru = "7f490a9c9c0da94f4e9474f4efe74be1"
  private static let gone = String(repeating: "f", count: 32)

  private func known(_ id: String, _ headword: String, _ reading: String) -> WordKnowledgeRecord {
    WordKnowledgeRecord(
      entryID: id, headword: headword, reading: reading, status: .known, updatedAt: Date())
  }

  @Test("a known word gets Look Up's row, and a word the dictionary no longer has gets none")
  func words() async throws {
    let core = try await PresentationCore.freshInstall()
    let miru = known(Self.miru, "見る", "みる")
    let gone = known(Self.gone, "消えた語", "きえたご")
    let sun = known("kanji:日", "日", "")
    #expect([miru, gone, sun].map(\.item.storedID) == [Self.miru, Self.gone, "kanji:日"])
    let rows = try #require(
      await KnowledgeRows.resolving(
        [gone, miru, sun], known: [Self.miru, Self.gone], using: .live, core: core))
    let word = try #require(rows.word(for: miru))
    #expect(word.entry.headword == "見る")
    #expect(word.row.id == Self.miru)
    #expect(word.row.summary == word.entry.summary)
    #expect(word.row.summary.contains("see"))
    #expect(word.row.spoken.hasPrefix("Known"))
    #expect(rows.word(for: gone) == nil)
    #expect(rows.words.count == 1)
  }

  @Test("a resolution cancelled before it finishes answers nothing")
  func cancelled() async throws {
    let core = try await PresentationCore.freshInstall()
    let records = [known(Self.miru, "見る", "みる")]
    let resolution = Task {
      await KnowledgeRows.resolving(records, known: [Self.miru], using: .live, core: core)
    }
    resolution.cancel()
    #expect(await resolution.value == nil)
  }

  @Test("a known kanji gets Look Up's kanji row, with the meaning of the word it writes")
  func kanji() async throws {
    let core = try await PresentationCore.freshInstall()
    let sun = try #require(KanjiCharacter("日"))
    let row = try #require(await KnowledgeRows.kanjiRow(sun, using: .live, core: core))
    #expect(row.character == "日")
    #expect(row.label == "KANJI")
    #expect(row.entry != nil)
    #expect(!row.summary.isEmpty)
  }
}
