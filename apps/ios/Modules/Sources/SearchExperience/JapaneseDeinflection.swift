import Foundation

/// The dictionary word class a deinflected candidate must have. Candidates are only
/// accepted when a dictionary entry with that exact form carries a matching part of speech.
enum JapaneseWordClass: Hashable, Sendable {
  case ichidan
  case godan
  case kuru
  case suru
  /// A noun used with する, such as 勉強 in 勉強した.
  case suruNoun
  case iAdjective

  func accepts(_ partsOfSpeech: [PartOfSpeech]) -> Bool {
    switch self {
    case .ichidan: partsOfSpeech.contains(.ichidanVerb)
    case .godan: partsOfSpeech.contains(.godanVerb)
    case .kuru: partsOfSpeech.contains(.kuruVerb)
    case .suru: partsOfSpeech.contains(.suruVerb)
    case .suruNoun: partsOfSpeech.contains(.takesSuru) || partsOfSpeech.contains(.suruVerb)
    case .iAdjective: partsOfSpeech.contains(.iAdjective)
    }
  }
}

struct JapaneseDeinflection: Hashable, Sendable {
  let term: String
  let wordClasses: Set<JapaneseWordClass>
  /// Number of rules applied; shorter chains are more plausible readings of the query.
  let depth: Int
}

/// Condition-aware, chained suffix rewriting for kana and kanji inflections.
///
/// Each rule rewrites an inflected suffix to a base suffix. Every rule may apply to the
/// surface text; after that, a rule only applies when its input classes include the class
/// the previous rule produced (ない is an i-adjective, so なかった → ない → base).
/// Candidates are hypotheses; lookup keeps only forms that exist with a matching class.
enum JapaneseDeinflector {
  static let maximumDepth = 6

  static func candidates(for text: String) -> [JapaneseDeinflection] {
    guard !text.isEmpty else { return [] }
    var results: [JapaneseDeinflection] = []
    var seen: Set<String> = [text + "|"]
    var frontier: [(term: String, classes: Set<JapaneseWordClass>)] = [(text, [])]
    for depth in 1...maximumDepth {
      var next: [(term: String, classes: Set<JapaneseWordClass>)] = []
      for (term, classes) in frontier {
        for rule in rules where term.hasSuffix(rule.inflected) {
          guard term.count > rule.inflected.count || rule.base.count > 1 else { continue }
          if !classes.isEmpty, rule.input.isDisjoint(with: classes) { continue }
          let base = String(term.dropLast(rule.inflected.count)) + rule.base
          let key = base + "|" + rule.output.map { "\($0)" }.sorted().joined(separator: ",")
          guard base != text, seen.insert(key).inserted else { continue }
          results.append(JapaneseDeinflection(term: base, wordClasses: rule.output, depth: depth))
          next.append((base, rule.output))
          if rule.output.contains(.suru), base.hasSuffix("する"), base.count > 2 {
            results.append(
              JapaneseDeinflection(
                term: String(base.dropLast(2)), wordClasses: [.suruNoun], depth: depth))
          }
        }
      }
      guard !next.isEmpty else { break }
      frontier = next
    }
    return results
  }

  private struct Rule {
    let inflected: String
    let base: String
    let input: Set<JapaneseWordClass>
    let output: Set<JapaneseWordClass>
  }

  /// The stems one verb class exposes to the shared suffix families below.
  private struct VerbPattern {
    let base: String
    let wordClass: JapaneseWordClass
    let negative: [String]
    let continuative: [String]
    let te: [String]
    let ta: [String]
    let conditional: [String]
    let volitional: [String]
    let imperative: [String]
    /// Derived ichidan verbs: passive, causative, and potential.
    let derived: [String]
  }

  private static let rules: [Rule] = verbPatterns.flatMap(verbRules) + adjectiveRules

  private static let verbPatterns: [VerbPattern] = {
    var patterns = [
      VerbPattern(
        base: "る", wordClass: .ichidan, negative: [""], continuative: [""], te: ["て"],
        ta: ["た"], conditional: ["れ"], volitional: ["よう"], imperative: ["ろ", "よ"],
        derived: ["られる", "させる", "れる"])
    ]
    // Godan rows: ending, a-, i-, e-, o-stems, and the te-form sound change.
    let godanRows: [(String, String, String, String, String, String)] = [
      ("う", "わ", "い", "え", "お", "って"), ("く", "か", "き", "け", "こ", "いて"),
      ("ぐ", "が", "ぎ", "げ", "ご", "いで"), ("す", "さ", "し", "せ", "そ", "して"),
      ("つ", "た", "ち", "て", "と", "って"), ("ぬ", "な", "に", "ね", "の", "んで"),
      ("ぶ", "ば", "び", "べ", "ぼ", "んで"), ("む", "ま", "み", "め", "も", "んで"),
      ("る", "ら", "り", "れ", "ろ", "って"),
    ]
    for (ending, a, i, e, o, te) in godanRows {
      patterns.append(
        VerbPattern(
          base: ending, wordClass: .godan, negative: [a], continuative: [i], te: [te],
          ta: [pastForm(te)], conditional: [e], volitional: [o + "う"], imperative: [e],
          derived: [a + "れる", a + "せる", e + "る"]))
    }
    // 行く is the one godan く verb with a っ sound change.
    for stem in ["行", "い"] {
      patterns.append(
        VerbPattern(
          base: stem + "く", wordClass: .godan, negative: [], continuative: [],
          te: [stem + "って"], ta: [stem + "った"], conditional: [], volitional: [],
          imperative: [], derived: []))
    }
    for (base, prefix) in [("来る", "来"), ("くる", "")] {
      let k = prefix.isEmpty ? "く" : prefix
      let ko = prefix.isEmpty ? "こ" : prefix
      let ki = prefix.isEmpty ? "き" : prefix
      patterns.append(
        VerbPattern(
          base: base, wordClass: .kuru, negative: [ko], continuative: [ki], te: [ki + "て"],
          ta: [ki + "た"], conditional: [k + "れ"], volitional: [ko + "よう"],
          imperative: [ko + "い"], derived: [ko + "られる", ko + "させる", ko + "れる"]))
    }
    patterns.append(
      VerbPattern(
        base: "する", wordClass: .suru, negative: ["し"], continuative: ["し"], te: ["して"],
        ta: ["した"], conditional: ["すれ"], volitional: ["しよう"], imperative: ["しろ", "せよ"],
        derived: ["される", "させる", "できる"]))
    return patterns
  }()

  private static func pastForm(_ te: String) -> String {
    String(te.dropLast()) + (te.hasSuffix("で") ? "だ" : "た")
  }

  private static func verbRules(_ pattern: VerbPattern) -> [Rule] {
    var rules: [Rule] = []
    let output: Set<JapaneseWordClass> = [pattern.wordClass]
    func add(_ stems: [String], _ suffixes: [String], input: Set<JapaneseWordClass> = []) {
      for stem in stems {
        for suffix in suffixes {
          rules.append(
            Rule(inflected: stem + suffix, base: pattern.base, input: input, output: output))
        }
      }
    }
    add(pattern.negative, ["ない"], input: [.iAdjective])
    add(pattern.negative, ["ず", "ずに", "ぬ"])
    add(
      pattern.continuative,
      ["ます", "ました", "ません", "ませんでした", "ましょう", "まして", "なさい", "ながら", "そう"])
    add(pattern.continuative, ["たい"], input: [.iAdjective])
    add(pattern.continuative, ["すぎる"], input: [.ichidan])
    add(pattern.te, ["", "ください"])
    add(pattern.te, ["いる", "る"], input: [.ichidan])
    add(pattern.te, ["しまう", "おく"], input: [.godan])
    add(pattern.ta, ["", "ら", "り"])
    add(pattern.conditional, ["ば"])
    add(pattern.volitional, [""])
    add(pattern.imperative, [""])
    add(pattern.derived, [""], input: [.ichidan])
    // Contracted てしまう: 食べちゃう, 読んじゃう.
    for te in pattern.te {
      let contracted = String(te.dropLast()) + (te.hasSuffix("で") ? "じゃう" : "ちゃう")
      rules.append(Rule(inflected: contracted, base: pattern.base, input: [.godan], output: output))
    }
    return rules.filter { !$0.inflected.isEmpty }
  }

  private static let adjectiveRules: [Rule] = {
    let adjective: Set<JapaneseWordClass> = [.iAdjective]
    let surface: [(String, Set<JapaneseWordClass>)] = [
      ("く", []), ("くて", []), ("かった", []), ("かったら", []), ("かったり", []),
      ("ければ", []), ("さ", []), ("そう", []), ("かろう", []),
      ("くない", adjective), ("すぎる", [.ichidan]), ("くなる", [.godan]),
    ]
    return surface.map { Rule(inflected: $0.0, base: "い", input: $0.1, output: adjective) }
      + [Rule(inflected: "ないで", base: "ない", input: [], output: adjective)]
  }()
}
