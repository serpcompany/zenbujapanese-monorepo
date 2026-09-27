import Testing
@testable import SearchExperience

@Suite("Part-of-speech wording")
struct PartOfSpeechFormatterTests {
  private func phrase(_ labels: String...) -> String {
    PartOfSpeechFormatter.phrase(for: labels.map(PartOfSpeech.init(rawValue:)))
  }

  @Test("transitivity modifies the verb class instead of repeating verb")
  func verbClasses() {
    #expect(phrase("Godan Verb", "Intransitive Verb") == "Godan verb (intransitive)")
    #expect(phrase("Ichidan Verb", "Transitive Verb") == "Ichidan verb (transitive)")
    #expect(
      phrase("Godan Verb", "Transitive Verb", "Intransitive Verb")
        == "Godan verb (transitive or intransitive)")
    #expect(phrase("Suru Verb", "Transitive Verb") == "する verb (transitive)")
  }

  @Test("a noun with transitivity and no verb class takes する")
  func suruNouns() {
    #expect(phrase("Noun", "Transitive Verb") == "Noun · する verb (transitive)")
    #expect(
      phrase("Noun", "Transitive Verb", "Intransitive Verb")
        == "Noun · する verb (transitive or intransitive)")
  }

  @Test("other categories use sentence case, keep order, and drop noise")
  func otherCategories() {
    #expect(phrase("Na-adjective", "Noun") == "Na-adjective · Noun")
    #expect(phrase("Expression", "Godan Verb") == "Expression · Godan verb")
    #expect(phrase("Numeric") == "Number")
    #expect(phrase("Godan Verb", "Verb") == "Godan verb")
    #expect(phrase("Other") == "")
    #expect(phrase("Noun", "Noun") == "Noun")
  }
}
