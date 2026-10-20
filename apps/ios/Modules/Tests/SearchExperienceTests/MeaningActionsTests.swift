import Testing
import TranslatorCore

@testable import SearchExperience

@MainActor
@Suite("What a meaning's menu does")
struct MeaningActionsTests {
  @Test("Speak gives the speech client English and each gloss without its closing note")
  func speak() async throws {
    let senses = try await sensesOfInu()
    let recorded = Recorded()
    recorded.actions.speak(senses[0])
    #expect(recorded.spoken == ["dog, canine"])
    #expect(recorded.languages == [.english])
  }

  @Test("Copy copies the meaning as shown with its note line, and Look Up offers each gloss")
  func copyAndLookUp() async throws {
    let senses = try await sensesOfInu()
    let recorded = Recorded()
    recorded.actions.copy(senses[1])
    #expect(recorded.copied == ["\(senses[1].meaning)\n\(try #require(senses[1].noteText))"])
    #expect(senses[0].glosses == ["dog", "canine"])
    #expect(senses[1].glosses.first == "squealer")
  }

  @Test(
    "Look Up offers each gloss JMdict gives, whole when it holds a comma, and Speak says them all",
    arguments: [
      ("厚生労働省", ["Ministry of Health, Labour and Welfare", "MHLW"]),
      ("１０万", ["100,000", "hundred thousand"]),
    ])
  func wholeGlosses(headword: String, glosses: [String]) async throws {
    let sense = try #require(try await senses(of: headword).first)
    let recorded = Recorded()
    recorded.actions.speak(sense)
    #expect(sense.glosses == glosses)
    #expect(recorded.spoken == [glosses.joined(separator: ", ")])
  }

  private func sensesOfInu() async throws -> [WordPage.Sense] {
    let senses = try await senses(of: "犬", reading: "いぬ")
    try #require(senses.count > 1)
    #expect(senses[0].meaning == "dog (Canis (lupus) familiaris), canine")
    return senses
  }

  private func senses(of headword: String, reading: String? = nil) async throws
    -> [WordPage.Sense]
  {
    let results = try await LookupClient.live.search(SearchQuery(headword))
    let entry = try #require(
      results.entries.first { $0.headword == headword && (reading ?? $0.reading) == $0.reading })
    return try #require(WordPage(entry)?.senses)
  }
}

@MainActor
private final class Recorded {
  var spoken: [String] = []
  var languages: [SpokenLanguage] = []
  var copied: [String] = []

  var actions: MeaningActions {
    MeaningActions(
      speechSynthesisClient: SpeechSynthesisClient { [self] text, language in
        spoken.append(text)
        languages.append(language)
      },
      lookUp: { _ in },
      writeToPasteboard: { [self] in copied.append($0) })
  }
}
