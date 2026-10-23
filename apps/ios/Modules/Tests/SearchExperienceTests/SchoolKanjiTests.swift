import Foundation
import Testing

@testable import SearchExperience

@Suite("School kanji")
struct SchoolKanjiTests {
  private struct Reference: Decodable {
    struct Entry: Decodable {
      let character: String
      let grade: Int?
      let frequencyRank: Int?
    }

    let entries: [Entry]
  }

  private static let lists: [(id: String, title: String, grades: Set<Int>, count: String)] = [
    ("grade-1", "Grade 1", [1], "80"),
    ("grade-2", "Grade 2", [2], "160"),
    ("grade-3", "Grade 3", [3], "200"),
    ("grade-4", "Grade 4", [4], "202"),
    ("grade-5", "Grade 5", [5], "193"),
    ("grade-6", "Grade 6", [6], "191"),
    ("secondary-school", "Secondary school", [8], "1,110"),
    ("jinmeiyo", "Jinmeiyō", [9, 10], "863"),
  ]

  private func panel(_ filter: String = "", known: [String] = []) throws -> SchoolKanjiPanel {
    try SchoolKanjiClient.live.panel(SchoolKanjiRequest(filter: filter, known: known))
  }

  private static let compatibilityPairs: [(compatibility: String, ordinary: String)] = [
    ("\u{FA16}", "\u{732A}"),
    ("\u{FA46}", "\u{6E1A}"),
    ("\u{FA4A}", "\u{7422}"),
    ("\u{FA4F}", "\u{7950}"),
    ("\u{FA53}", "\u{798E}"),
  ]

  private func codePoints(_ character: String) -> [Unicode.Scalar] {
    Array(character.unicodeScalars)
  }

  private func mostFrequentFirst(
    _ grades: Set<Int>, in reference: Reference
  ) -> [[Unicode.Scalar]] {
    reference.entries
      .filter { $0.grade.map(grades.contains) ?? false }
      .sorted {
        ($0.frequencyRank ?? .max, $0.character.unicodeScalars.first?.value ?? 0)
          < ($1.frequencyRank ?? .max, $1.character.unicodeScalars.first?.value ?? 0)
      }
      .map { codePoints($0.character) }
  }

  @Test("each grade lists the bundled KANJIDIC2 grade's kanji, most frequent first, as the website does")
  func lists() throws {
    let file = try #require(KanjiFiles.bundled).wholeReference()
    let reference = try JSONDecoder().decode(Reference.self, from: Data(file.dropLast()))
    let sections = try panel().sections
    #expect(sections.map(\.id) == Self.lists.map(\.id))
    for (section, list) in zip(sections, Self.lists) {
      #expect(section.title == list.title)
      #expect(section.count == list.count)
      #expect(section.kanji.map(\.id) == mostFrequentFirst(list.grades, in: reference))
    }
    #expect(sections.first?.kanji.prefix(5).map(\.character) == ["日", "一", "人", "年", "大"])
    #expect(sections.first?.kanji.first?.meaning == "day")
  }

  @Test("each Jinmeiyō tile has its own ID, so both forms of a compatibility kanji are two tiles")
  func compatibilityKanjiTiles() throws {
    let jinmeiyo = try #require(panel().sections.last)
    let ids = jinmeiyo.kanji.map(\.id)
    #expect(Set(ids).count == ids.count)
    for pair in Self.compatibilityPairs {
      #expect(ids.contains(codePoints(pair.compatibility)))
      #expect(ids.contains(codePoints(pair.ordinary)))
    }
  }

  @Test("a compatibility kanji is found by either form of it, and by the meaning its tile shows")
  func compatibilityKanjiFilter() throws {
    for pair in Self.compatibilityPairs {
      for typed in [pair.compatibility, pair.ordinary] {
        let jinmeiyo = try #require(panel(typed).sections.first { $0.id == "jinmeiyo" })
        #expect(
          Set(jinmeiyo.kanji.map(\.id))
            == [codePoints(pair.ordinary), codePoints(pair.compatibility)])
      }
    }
    let sea = try #require(panel("sea").sections.first { $0.id == "jinmeiyo" })
    let tile = try #require(sea.kanji.first { $0.id == codePoints("\u{FA45}") })
    #expect(tile.meaning == "sea")
  }

  @Test("a filter narrows every grade at once by meaning, kana reading, or the kanji itself")
  func filter() throws {
    let water = try panel("water")
    #expect(water.filtered)
    let first = try #require(water.sections.first)
    #expect(first.id == "grade-1")
    #expect(first.kanji.map(\.character).contains("水"))
    #expect(first.count == "\(first.kanji.count) of 80")
    #expect(try panel("みず").sections.first?.kanji.map(\.character).contains("水") == true)
    #expect(try panel("ミズ").sections.first?.kanji.map(\.character).contains("水") == true)
    #expect(try panel("水").sections.map(\.count) == ["1 of 80"])
    #expect(try panel("qxzqxz").sections.isEmpty)
    #expect(try panel("").filtered == false)
  }

  @Test("known kanji are marked on their tile and counted in their grade's header")
  func known() throws {
    let sections = try panel(known: ["日", "水", "海"]).sections
    let first = try #require(sections.first)
    #expect(first.known == 2)
    #expect(first.spoken == "Grade 1, 80 kanji, 2 known")
    #expect(first.kanji.filter(\.known).map(\.character) == ["日", "水"])
    #expect(sections.dropFirst().first?.known == 1)
    #expect(try panel().sections.allSatisfy { $0.known == 0 })
  }

  @Test("a known kanji marks its compatibility form's tile known too, and its grade counts both")
  func knownCompatibilityKanji() throws {
    let ordinary = Self.compatibilityPairs.map(\.ordinary)
    let jinmeiyo = try #require(panel(known: ordinary).sections.last)
    #expect(jinmeiyo.known == ordinary.count * 2)
    #expect(
      Set(jinmeiyo.kanji.filter(\.known).map(\.id))
        == Set(Self.compatibilityPairs.flatMap { [codePoints($0.compatibility), codePoints($0.ordinary)] }))
    let sea = try panel(known: ["\u{6D77}"]).sections
    #expect(sea.first { $0.id == "grade-2" }?.known == 1)
    #expect(sea.last?.known == 1)
    #expect(sea.last?.kanji.first { $0.id == codePoints("\u{FA45}") }?.known == true)
  }

  @Test("a panel remembers which sections were closed")
  func closedSections() {
    let closed = ClosedTileSections(ids: ["grade-2", "strokes-3"])
    #expect(ClosedTileSections(rawValue: closed.rawValue)?.ids == closed.ids)
    #expect(ClosedTileSections(rawValue: "")?.ids.isEmpty == true)
  }

  @Test("Kanji Meanings are on until the learner turns them off")
  @MainActor
  func kanjiMeanings() {
    let defaults = MemoryDefaults()
    #expect(ReadingAidPreferences(defaults: defaults).showsKanjiMeanings)
    ReadingAidPreferences(defaults: defaults).showsKanjiMeanings = false
    #expect(ReadingAidPreferences(defaults: defaults).showsKanjiMeanings == false)
  }
}
