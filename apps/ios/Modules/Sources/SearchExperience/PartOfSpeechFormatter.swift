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
        if !hasVerbClass { phrases.append("Verb") }
      } else if part == .noun {
        if !takesNo { phrases.append("Noun") }
      } else if part == .adverb {
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
