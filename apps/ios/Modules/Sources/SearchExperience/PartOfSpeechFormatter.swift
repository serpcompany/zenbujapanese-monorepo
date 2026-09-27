/// Turns dictionary part-of-speech categories into one readable phrase, such as
/// "Godan verb (intransitive)" instead of "Godan Verb · Intransitive Verb".
///
/// All part-of-speech wording lives here. The importer only supplies stable category
/// identifiers, so wording can change without regenerating language data.
enum PartOfSpeechFormatter {
  static func phrase(for parts: [PartOfSpeech]) -> String {
    let transitive = parts.contains(.transitive)
    let intransitive = parts.contains(.intransitive)
    let hasVerbClass = parts.contains { verbClassNames[$0] != nil }
    let takesNo = parts.contains(.noAdjective)
    let takesTo = parts.contains(.adverbTo)
    var phrases: [String] = []

    for part in parts {
      if let verb = verbClassNames[part] {
        phrases.append(verb)
      } else if part == .verb {
        // A generic "Verb" adds nothing beside a specific class such as "Godan verb".
        if !hasVerbClass { phrases.append("Verb") }
      } else if part == .noun {
        // "Noun (の)" already says noun.
        if !takesNo { phrases.append("Noun") }
      } else if part == .adverb {
        // "Adverb (と)" already says adverb.
        if !takesTo { phrases.append("Adverb") }
      } else if let name = otherNames[part] {
        phrases.append(name)
      }
    }

    var seen = Set<String>()
    phrases = phrases.filter { seen.insert($0).inserted }

    if transitive || intransitive {
      let modifier = transitivityModifier(transitive: transitive, intransitive: intransitive)
      if let verbIndex = phrases.firstIndex(where: isVerbPhrase) {
        phrases[verbIndex] += " (\(modifier))"
      } else {
        phrases.append("Verb (\(modifier))")
      }
    }

    return phrases.joined(separator: " · ")
  }

  private static func transitivityModifier(transitive: Bool, intransitive: Bool) -> String {
    switch (transitive, intransitive) {
    case (true, true): "transitive or intransitive"
    case (true, false): "transitive"
    default: "intransitive"
    }
  }

  private static func isVerbPhrase(_ phrase: String) -> Bool {
    phrase == "Verb" || phrase.hasSuffix(" verb")
  }

  /// Verb classes. A noun that takes する reads as "する verb" beside its noun class.
  private static let verbClassNames: [PartOfSpeech: String] = [
    .godanVerb: "Godan verb",
    .ichidanVerb: "Ichidan verb",
    .suruVerb: "する verb",
    .takesSuru: "する verb",
    .kuruVerb: "Irregular verb",
    .zuruVerb: "Zuru verb",
    .archaicVerb: "Archaic verb",
    .auxiliaryVerb: "Auxiliary verb",
  ]

  /// Everything else in sentence case. "Unclassified" is left out: it tells a learner nothing.
  private static let otherNames: [PartOfSpeech: String] = [
    .pronoun: "Pronoun",
    .nounPrefix: "Prefix",
    .nounSuffix: "Suffix",
    .noAdjective: "Noun (の)",
    .prenominal: "Prenominal",
    .preNounAdjective: "Pre-noun adjective",
    .iAdjective: "I-adjective",
    .naAdjective: "Na-adjective",
    .taruAdjective: "Taru adjective",
    .archaicAdjective: "Archaic adjective",
    .archaicNaAdjective: "Archaic na-adjective",
    .adverbTo: "Adverb (と)",
    .auxiliary: "Auxiliary",
    .auxiliaryAdjective: "Auxiliary adjective",
    .conjunction: "Conjunction",
    .copula: "Copula",
    .counter: "Counter",
    .expression: "Expression",
    .interjection: "Interjection",
    .numeric: "Number",
    .prefix: "Prefix",
    .suffix: "Suffix",
    .particle: "Particle",
  ]
}
