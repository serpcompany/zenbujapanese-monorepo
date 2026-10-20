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

  private func sensesOfInu() async throws -> [WordPage.Sense] {
    let results = try await LookupClient.live.search(SearchQuery("犬"))
    let inu = try #require(results.entries.first { $0.headword == "犬" && $0.reading == "いぬ" })
    let senses = try #require(WordPage(inu)?.senses)
    try #require(senses.count > 1)
    #expect(senses[0].meaning == "dog (Canis (lupus) familiaris), canine")
    return senses
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
