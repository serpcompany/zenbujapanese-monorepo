import Testing
@testable import SearchExperience

@Suite("Inflection grouping")
struct JapaneseInflectionGroupingTests {
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

  @Test("na-adjective stems join な, で, or に, but not the copula")
  func naAdjectives() {
    let ipadicStem: (String, String, [String]) = ("静か", "静か", ["名詞", "形容動詞語幹"])
    #expect(surfaces([ipadicStem, ("な", "だ", ["助動詞"]), ("人", "人", ["名詞", "一般"])])
      == ["静かな", "人"])
    #expect(surfaces([ipadicStem, ("に", "に", ["助詞", "副詞化"])]) == ["静かに"])
    #expect(surfaces([ipadicStem, ("で", "だ", ["助動詞"])]) == ["静かで"])
    #expect(surfaces([ipadicStem, ("だ", "だ", ["助動詞"])]) == ["静か", "だ"])
    #expect(surfaces([ipadicStem, ("でし", "です", ["助動詞"]), ("た", "た", ["助動詞"])])
      == ["静か", "でし", "た"])
    let unidicStem: (String, String, [String]) = ("静か", "静か", ["形状詞", "一般"])
    #expect(surfaces([unidicStem, ("な", "だ", ["助動詞"])]) == ["静かな"])
    #expect(surfaces([unidicStem, ("に", "だ", ["助動詞"])]) == ["静かに"])
    #expect(surfaces([("学生", "学生", ["名詞", "一般"]), ("な", "だ", ["助動詞"])]) == ["学生", "な"])
  }

  @Test("adjectives, conditionals, and voiced te-forms join")
  func adjectivesAndConnectives() {
    #expect(
      surfaces([
        ("高く", "高い", ["形容詞", "自立"]), ("なかっ", "ない", ["助動詞"]), ("た", "た", ["助動詞"]),
      ]) == ["高くなかった"])
    #expect(
      surfaces([("見れ", "見る", ["動詞", "自立"]), ("ば", "ば", ["助詞", "接続助詞"])]) == ["見れば"])
    #expect(
      surfaces([
        ("読ん", "読む", ["動詞", "自立"]), ("で", "で", ["助詞", "接続助詞"]),
        ("いる", "いる", ["動詞", "非自立"]),
      ]) == ["読んでいる"])
  }

  @Test("an independent verb after a te-form starts a new word")
  func independentVerbAfterTe() {
    #expect(
      surfaces([
        ("見", "見る", ["動詞", "自立"]), ("て", "て", ["助詞", "接続助詞"]),
        ("帰る", "帰る", ["動詞", "自立"]),
      ]) == ["見て", "帰る"])
  }

  @Test("only joined candidates are marked as joined inflections")
  func joinedMarker() {
    let grouped = JapaneseInflectionGrouping.group(
      candidates([
        ("本", "本", ["名詞", "一般"]), ("しまっ", "しまう", ["動詞", "自立"]), ("た", "た", ["助動詞"]),
      ]))
    #expect(grouped.map(\.joinsInflection) == [false, true])
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
