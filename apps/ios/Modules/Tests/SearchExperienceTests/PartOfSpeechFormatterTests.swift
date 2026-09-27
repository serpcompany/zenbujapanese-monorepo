import Testing
@testable import SearchExperience

@Suite("Part-of-speech wording")
struct PartOfSpeechFormatterTests {
  private func phrase(_ parts: PartOfSpeech...) -> String {
    PartOfSpeechFormatter.phrase(for: parts)
  }

  @Test("transitivity modifies the verb class instead of repeating verb")
  func verbClasses() {
    #expect(phrase(.godanVerb, .intransitive) == "Godan verb (intransitive)")
    #expect(phrase(.ichidanVerb, .transitive) == "Ichidan verb (transitive)")
    #expect(
      phrase(.godanVerb, .transitive, .intransitive) == "Godan verb (transitive or intransitive)")
    #expect(phrase(.suruVerb, .transitive) == "する verb (transitive)")
    #expect(phrase(.kuruVerb, .intransitive) == "Irregular verb (intransitive)")
    #expect(phrase(.zuruVerb, .transitive) == "Zuru verb (transitive)")
    #expect(phrase(.archaicVerb) == "Archaic verb")
    #expect(phrase(.auxiliaryVerb) == "Auxiliary verb")
    #expect(phrase(.verb) == "Verb")
    #expect(phrase(.godanVerb, .verb) == "Godan verb")
    #expect(phrase(.transitive) == "Verb (transitive)")
  }

  @Test("a noun that takes する reads as a noun and a する verb")
  func suruNouns() {
    #expect(phrase(.noun, .takesSuru, .transitive) == "Noun · する verb (transitive)")
    #expect(
      phrase(.noun, .takesSuru, .transitive, .intransitive)
        == "Noun · する verb (transitive or intransitive)")
    #expect(phrase(.noun, .takesSuru) == "Noun · する verb")
    #expect(phrase(.takesSuru, .suruVerb, .transitive) == "する verb (transitive)")
  }

  @Test("nouns, pronouns, and noun modifiers keep their own class")
  func nounClasses() {
    #expect(phrase(.noun) == "Noun")
    #expect(phrase(.pronoun) == "Pronoun")
    #expect(phrase(.noun, .noAdjective) == "Noun (の)")
    #expect(phrase(.noAdjective, .takesSuru) == "Noun (の) · する verb")
    #expect(phrase(.nounPrefix) == "Prefix")
    #expect(phrase(.nounSuffix) == "Suffix")
    #expect(phrase(.noun, .nounSuffix) == "Noun · Suffix")
    #expect(phrase(.prenominal) == "Prenominal")
    #expect(phrase(.preNounAdjective) == "Pre-noun adjective")
  }

  @Test("adjectives and adverbs name their class")
  func adjectivesAndAdverbs() {
    #expect(phrase(.naAdjective, .noun) == "Na-adjective · Noun")
    #expect(phrase(.iAdjective) == "I-adjective")
    #expect(phrase(.taruAdjective, .adverbTo) == "Taru adjective · Adverb (と)")
    #expect(phrase(.archaicAdjective) == "Archaic adjective")
    #expect(phrase(.archaicNaAdjective) == "Archaic na-adjective")
    #expect(phrase(.auxiliaryAdjective) == "Auxiliary adjective")
    #expect(phrase(.adverb) == "Adverb")
    #expect(phrase(.adverb, .adverbTo, .takesSuru) == "Adverb (と) · する verb")
  }

  @Test("other categories use sentence case, keep order, and drop noise")
  func otherCategories() {
    #expect(phrase(.expression, .godanVerb) == "Expression · Godan verb")
    #expect(phrase(.numeric) == "Number")
    #expect(phrase(.auxiliary) == "Auxiliary")
    #expect(phrase(.conjunction) == "Conjunction")
    #expect(phrase(.copula) == "Copula")
    #expect(phrase(.counter) == "Counter")
    #expect(phrase(.interjection) == "Interjection")
    #expect(phrase(.prefix) == "Prefix")
    #expect(phrase(.suffix) == "Suffix")
    #expect(phrase(.particle) == "Particle")
    #expect(phrase(.unclassified) == "")
    #expect(phrase(PartOfSpeech(rawValue: "unknownCategory")) == "")
    #expect(phrase(.noun, .noun) == "Noun")
  }
}
