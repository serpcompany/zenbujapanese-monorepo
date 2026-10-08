import Foundation
import TranslatorCore

struct HeardSentence: Codable, Sendable, Equatable {
  var language: SpokenLanguage
  var text: String
}

struct LineScore: Codable, Sendable, Equatable {
  var language: SpokenLanguage
  var expected: String
  var recall: Double
  var wrongLanguage: Bool
}

struct SentenceScore: Codable, Sendable, Equatable {
  var language: SpokenLanguage
  var text: String
  var precision: Double
  var line: Int?

  var isPhantom: Bool { precision < Scoring.phantomPrecision }
}

struct Score: Codable, Sendable, Equatable {
  var lines: [LineScore]
  var turns: [[SentenceScore]]
  var expectedLanguages: [SpokenLanguage]
  var heardLanguages: [SpokenLanguage]
  var minimumRecall: Double

  var phantoms: [SentenceScore] { turns.flatMap { $0 }.filter(\.isPhantom) }
  var missedLines: [LineScore] { lines.filter { $0.recall < minimumRecall } }
  var wrongLanguageLines: [LineScore] { lines.filter(\.wrongLanguage) }
  var languagesMatch: Bool { expectedLanguages == heardLanguages }
  var recall: Double {
    let total = lines.map { Double($0.expected.count) }.reduce(0, +)
    let found = lines.map { Double($0.expected.count) * $0.recall }.reduce(0, +)
    return total > 0 ? found / total : 0
  }

  var passes: Bool {
    languagesMatch && phantoms.isEmpty && missedLines.isEmpty && wrongLanguageLines.isEmpty
  }
}

enum Scoring {
  static let phantomPrecision = 0.5

  static func score(_ script: Script, heard turns: [[HeardSentence]]) -> Score {
    let expected = script.lines.enumerated().flatMap { index, line in
      normalized(line.expected).map { (character: $0, owner: index) }
    }
    let sentences = turns.flatMap { $0 }
    let heard = sentences.enumerated().flatMap { index, sentence in
      normalized(sentence.text).map { (character: $0, owner: index) }
    }
    let matches = commonSubsequence(expected.map(\.character), heard.map(\.character))
    var lineMatches = Array(repeating: [Int](), count: script.lines.count)
    var sentenceMatches = Array(repeating: [Int](), count: sentences.count)
    for (expectedIndex, heardIndex) in matches {
      lineMatches[expected[expectedIndex].owner].append(heard[heardIndex].owner)
      sentenceMatches[heard[heardIndex].owner].append(expected[expectedIndex].owner)
    }
    let lines = script.lines.enumerated().map { index, line in
      let length = normalized(line.expected).count
      let wrong = lineMatches[index].filter { sentences[$0].language != line.language }.count
      return LineScore(
        language: line.language,
        expected: line.expected,
        recall: length > 0 ? Double(lineMatches[index].count) / Double(length) : 1,
        wrongLanguage: wrong * 2 > lineMatches[index].count
      )
    }
    var scored = sentences.enumerated().map { index, sentence in
      let length = normalized(sentence.text).count
      return SentenceScore(
        language: sentence.language,
        text: sentence.text,
        precision: length > 0 ? Double(sentenceMatches[index].count) / Double(length) : 0,
        line: mostCommon(sentenceMatches[index])
      )
    }
    let grouped = turns.map { turn in
      let taken = Array(scored.prefix(turn.count))
      scored.removeFirst(turn.count)
      return taken
    }
    return Score(
      lines: lines,
      turns: grouped,
      expectedLanguages: collapsed(script.lines.map(\.language)),
      heardLanguages: collapsed(turns.compactMap { $0.first?.language }),
      minimumRecall: script.minimumRecall
    )
  }

  static func normalized(_ text: String) -> [Character] {
    Array(text.precomposedStringWithCompatibilityMapping.lowercased().filter {
      $0.isLetter || $0.isNumber
    })
  }

  static func collapsed(_ languages: [SpokenLanguage]) -> [SpokenLanguage] {
    languages.reduce(into: []) { result, language in
      if result.last != language { result.append(language) }
    }
  }

  static func commonSubsequence(_ left: [Character], _ right: [Character]) -> [(Int, Int)] {
    guard !left.isEmpty, !right.isEmpty else { return [] }
    let width = right.count + 1
    var lengths = [Int32](repeating: 0, count: (left.count + 1) * width)
    for row in 1...left.count {
      for column in 1...right.count {
        lengths[row * width + column] =
          left[row - 1] == right[column - 1]
          ? lengths[(row - 1) * width + column - 1] + 1
          : max(lengths[(row - 1) * width + column], lengths[row * width + column - 1])
      }
    }
    var pairs: [(Int, Int)] = []
    var row = left.count
    var column = right.count
    while row > 0, column > 0 {
      if left[row - 1] == right[column - 1] {
        pairs.append((row - 1, column - 1))
        row -= 1
        column -= 1
      } else if lengths[(row - 1) * width + column] >= lengths[row * width + column - 1] {
        row -= 1
      } else {
        column -= 1
      }
    }
    return pairs.reversed()
  }

  private static func mostCommon(_ values: [Int]) -> Int? {
    Dictionary(grouping: values, by: { $0 }).max { $0.value.count < $1.value.count }?.key
  }
}
