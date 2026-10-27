import Observation
import TranslatorCore

enum ShownText {
  case plain
  case linked([JapaneseTextToken])
}

@MainActor
@Observable
final class LinkedTexts {
  private var linked: [String: [JapaneseTextToken]] = [:]
  @ObservationIgnored private var asked: Set<String> = []

  func shown(_ text: String, in language: SpokenLanguage) -> ShownText? {
    guard language == .japanese else { return .plain }
    return linked[text].map(ShownText.linked)
  }

  func isReady(_ sentence: TranslatedSentence, spokenIn language: SpokenLanguage) -> Bool {
    shown(sentence.text, in: language) != nil
      && (sentence.translation.map { shown($0, in: language.counterpart) != nil } ?? true)
  }

  @discardableResult
  func request(
    _ sentences: [(sentence: TranslatedSentence, language: SpokenLanguage)],
    using analysis: JapaneseTextAnalysisClient
  ) -> Task<Void, Never>? {
    var japanese: [String] = []
    for (sentence, language) in sentences {
      if language == .japanese { japanese.append(sentence.text) }
      if language.counterpart == .japanese, let translation = sentence.translation {
        japanese.append(translation)
      }
    }
    return request(japanese, using: analysis)
  }

  @discardableResult
  func request(_ texts: [String], using analysis: JapaneseTextAnalysisClient) -> Task<Void, Never>? {
    var seen = asked
    let unasked = texts.filter { seen.insert($0).inserted }
    guard !unasked.isEmpty else { return nil }
    asked.formUnion(unasked)
    return Task {
      var words = unasked.map(JapaneseTextToken.unlinked)
      if let found = await analysis.linkedTexts(unasked, nil), found.count == unasked.count {
        words = found
      } else {
        asked.subtract(unasked)
      }
      for (text, shown) in zip(unasked, words) { linked[text] = shown }
    }
  }
}

extension Conversation {
  var spokenSentences: [(sentence: TranslatedSentence, language: SpokenLanguage)] {
    turns.flatMap { turn in turn.sentences.map { ($0, turn.language) } }
  }
}
