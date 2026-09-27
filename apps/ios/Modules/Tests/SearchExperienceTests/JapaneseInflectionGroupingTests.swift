import Testing
@testable import SearchExperience

@Suite("Inflection grouping")
struct JapaneseInflectionGroupingTests {
  /// Builds IPADIC-style candidates from (surface, base, part of speech) triples.
  private func candidates(_ parts: [(String, String, [String])]) -> [JapaneseMorphologyCandidate] {
    var offset = 0
    return parts.map { surface, base, pos in
      defer { offset += surface.unicodeScalars.count }
      return JapaneseMorphologyCandidate(
        surface: surface,
        scalarRange: offset..<(offset + surface.unicodeScalars.count),
        dictionaryForm: base,
        normalizedForm: base,
        reading: surface,
        partOfSpeech: pos,
        isOutOfVocabulary: false,
        children: []
      )
    }
  }

  private func surfaces(_ parts: [(String, String, [String])]) -> [String] {
    JapaneseInflectionGrouping.group(candidates(parts)).map(\.surface)
  }

  @Test("a verb joins its auxiliaries and keeps its dictionary form")
  func verbWithAuxiliaries() {
    let parts: [(String, String, [String])] = [
      ("時計", "時計", ["名詞", "一般"]), ("、", "、", ["記号", "読点"]),
      ("見", "見る", ["動詞", "自立"]), ("なかっ", "ない", ["助動詞"]), ("た", "た", ["助動詞"]),
      ("の", "の", ["助詞", "終助詞"]),
    ]
    #expect(surfaces(parts) == ["時計", "、", "見なかった", "の"])
    let joined = JapaneseInflectionGrouping.group(candidates(parts))[2]
    #expect(joined.dictionaryForm == "見る")
    #expect(joined.scalarRange == 3..<8)
    #expect(joined.children.map(\.surface) == ["見", "なかっ", "た"])
  }

  @Test("te-form, helper verbs, and suffix verbs join; other words stay separate")
  func connectivesAndHelpers() {
    #expect(
      surfaces([
        ("見", "見る", ["動詞", "自立"]), ("て", "て", ["助詞", "接続助詞"]),
        ("い", "いる", ["動詞", "非自立"]), ("ない", "ない", ["助動詞"]),
      ]) == ["見ていない"])
    #expect(
      surfaces([
        ("見", "見る", ["動詞", "自立"]), ("させ", "させる", ["動詞", "接尾"]),
        ("られる", "られる", ["動詞", "接尾"]),
      ]) == ["見させられる"])
    #expect(
      surfaces([
        ("見", "見る", ["動詞", "自立"]), ("ない", "ない", ["助動詞"]),
        ("よう", "よう", ["名詞", "非自立"]), ("に", "に", ["助詞", "副詞化"]),
      ]) == ["見ない", "よう", "に"])
    #expect(
      surfaces([("学生", "学生", ["名詞", "一般"]), ("だ", "だ", ["助動詞"])]) == ["学生", "だ"])
    #expect(
      surfaces([
        ("見", "見る", ["動詞", "自立"]), ("が", "が", ["助詞", "接続助詞"]),
        ("いる", "いる", ["動詞", "非自立"]),
      ]) == ["見", "が", "いる"])
  }
}
