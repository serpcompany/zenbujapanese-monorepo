import Foundation

enum JapaneseInflectionGrouping {
  static func group(_ candidates: [JapaneseMorphologyCandidate]) -> [JapaneseMorphologyCandidate] {
    var grouped: [JapaneseMorphologyCandidate] = []
    var index = candidates.startIndex
    while index < candidates.endIndex {
      let head = candidates[index]
      var pieces = [head]
      index += 1
      if isInflectingHead(head) {
        while index < candidates.endIndex, attaches(candidates[index], after: pieces.last!) {
          pieces.append(candidates[index])
          index += 1
        }
      } else if isNaAdjectiveStem(head), index < candidates.endIndex,
        ["な", "で", "に"].contains(candidates[index].surface),
        ["助動詞", "助詞"].contains(candidates[index].partOfSpeech.first)
      {
        pieces.append(candidates[index])
        index += 1
      }
      grouped.append(pieces.count == 1 ? head : joined(pieces))
    }
    return grouped
  }

  private static func isInflectingHead(_ candidate: JapaneseMorphologyCandidate) -> Bool {
    ["動詞", "形容詞"].contains(candidate.partOfSpeech.first)
  }

  private static func isNaAdjectiveStem(_ candidate: JapaneseMorphologyCandidate) -> Bool {
    let pos = candidate.partOfSpeech
    return pos.first == "形状詞" || (pos.first == "名詞" && pos.contains("形容動詞語幹"))
  }

  private static func attaches(
    _ candidate: JapaneseMorphologyCandidate,
    after previous: JapaneseMorphologyCandidate
  ) -> Bool {
    let pos = candidate.partOfSpeech
    switch pos.first {
    case "助動詞":
      return true
    case "助詞":
      return pos.contains("接続助詞") && ["て", "で", "ば"].contains(candidate.surface)
    case "動詞":
      if pos.contains("接尾") { return true }
      let isHelper = pos.contains("非自立") || pos.contains("非自立可能")
      return isHelper && ["て", "で"].contains(previous.surface)
    default:
      return false
    }
  }

  private static func joined(_ pieces: [JapaneseMorphologyCandidate]) -> JapaneseMorphologyCandidate {
    let head = pieces[0]
    return JapaneseMorphologyCandidate(
      surface: pieces.map(\.surface).joined(),
      scalarRange: head.scalarRange.lowerBound..<pieces.last!.scalarRange.upperBound,
      dictionaryForm: head.dictionaryForm,
      normalizedForm: head.normalizedForm,
      reading: pieces.map(\.reading).joined(),
      partOfSpeech: head.partOfSpeech,
      isOutOfVocabulary: head.isOutOfVocabulary,
      children: pieces,
      joinsInflection: true
    )
  }
}
