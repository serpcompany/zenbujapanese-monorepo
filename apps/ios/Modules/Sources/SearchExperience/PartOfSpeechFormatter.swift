/// Turns dictionary part-of-speech categories into one readable phrase, such as
/// "Godan verb (intransitive)" instead of "Godan Verb · Intransitive Verb".
///
/// All part-of-speech wording lives here. The importer only supplies categories (see issue #361),
/// so wording can change without regenerating language data.
enum PartOfSpeechFormatter {
  static func phrase(for parts: [PartOfSpeech]) -> String {
    let transitive = parts.contains(.transitiveVerb)
    let intransitive = parts.contains(.intransitiveVerb)
    let hasVerbClass = parts.contains { verbClassNames[$0] != nil }
    var phrases: [String] = []

    for part in parts where part != .transitiveVerb && part != .intransitiveVerb {
      if let verb = verbClassNames[part] {
        phrases.append(verb)
      } else if part == .verb {
        // A generic "Verb" adds nothing beside a specific class such as "Godan verb".
        if !hasVerbClass { phrases.append("Verb") }
      } else if let name = otherNames[part] {
        phrases.append(name)
      }
    }

    if transitive || intransitive {
      let modifier = transitivityModifier(transitive: transitive, intransitive: intransitive)
      if let verbIndex = phrases.firstIndex(where: isVerbPhrase) {
        phrases[verbIndex] += " (\(modifier))"
      } else if phrases.contains("Noun") {
        // Transitivity on a noun with no verb class marks a noun that takes する.
        phrases.append("する verb (\(modifier))")
      } else {
        phrases.append("Verb (\(modifier))")
      }
    }

    var seen = Set<String>()
    return phrases.filter { seen.insert($0).inserted }.joined(separator: " · ")
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
    .irregularVerb: "Irregular verb",
    .auxiliaryVerb: "Auxiliary verb",
  ]

  /// Everything else in sentence case. "Other" is left out: it tells a learner nothing.
  private static let otherNames: [PartOfSpeech: String] = [
    PartOfSpeech(rawValue: "Noun"): "Noun",
    .naAdjective: "Na-adjective",
    .iAdjective: "I-adjective",
    PartOfSpeech(rawValue: "Adjective"): "Adjective",
    PartOfSpeech(rawValue: "Adverb"): "Adverb",
    PartOfSpeech(rawValue: "Particle"): "Particle",
    PartOfSpeech(rawValue: "Expression"): "Expression",
    PartOfSpeech(rawValue: "Conjunction"): "Conjunction",
    PartOfSpeech(rawValue: "Interjection"): "Interjection",
    PartOfSpeech(rawValue: "Pronoun"): "Pronoun",
    PartOfSpeech(rawValue: "Prefix"): "Prefix",
    PartOfSpeech(rawValue: "Suffix"): "Suffix",
    PartOfSpeech(rawValue: "Counter"): "Counter",
    PartOfSpeech(rawValue: "Auxiliary"): "Auxiliary",
    PartOfSpeech(rawValue: "Copula"): "Copula",
    PartOfSpeech(rawValue: "Numeric"): "Number",
  ]
}

extension PartOfSpeech {
  static let verb = Self(rawValue: "Verb")
  static let transitiveVerb = Self(rawValue: "Transitive Verb")
  static let intransitiveVerb = Self(rawValue: "Intransitive Verb")
  static let auxiliaryVerb = Self(rawValue: "Auxiliary Verb")
}
