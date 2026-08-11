import Foundation

struct JapaneseConjugationClient: Sendable {
  var table: @Sendable (DictionaryEntry) -> ConjugationTable?

  static let live = JapaneseConjugationClient(table: JapaneseConjugator.table)
}

struct ConjugationTable: Hashable, Sendable {
  let title: String
  let plain: [ConjugatedForm]
  let polite: [ConjugatedForm]

  var supportsModes: Bool { !polite.isEmpty }

  func forms(for mode: ConjugationMode) -> [ConjugatedForm] {
    switch mode {
    case .plain: plain
    case .polite: polite.isEmpty ? plain : polite
    }
  }
}

enum ConjugationMode: String, CaseIterable, Hashable, Sendable {
  case plain = "Plain"
  case polite = "Polite"
}

struct ConjugatedForm: Hashable, Identifiable, Sendable {
  let id: Kind
  let surface: String
  let reading: String

  var readingAnnotation: ReadingAnnotation? {
    guard surface != reading else { return nil }
    let surfaceCharacters = Array(surface)
    let readingCharacters = Array(reading)
    var sharedSuffixCount = 0
    while sharedSuffixCount < min(surfaceCharacters.count, readingCharacters.count),
          surfaceCharacters[surfaceCharacters.count - sharedSuffixCount - 1]
            == readingCharacters[readingCharacters.count - sharedSuffixCount - 1]
    {
      sharedSuffixCount += 1
    }
    let surfacePrefixEnd = surfaceCharacters.count - sharedSuffixCount
    let readingPrefixEnd = readingCharacters.count - sharedSuffixCount
    guard surfacePrefixEnd > 0, readingPrefixEnd > 0 else { return nil }
    return ReadingAnnotation(
      surfacePrefix: String(surfaceCharacters[..<surfacePrefixEnd]),
      readingPrefix: String(readingCharacters[..<readingPrefixEnd]),
      sharedSuffix: String(surfaceCharacters[surfacePrefixEnd...])
    )
  }

  struct ReadingAnnotation: Hashable, Sendable {
    let surfacePrefix: String
    let readingPrefix: String
    let sharedSuffix: String
  }

  enum Kind: String, CaseIterable, Hashable, Sendable {
    case presentFuture = "present-future"
    case past
    case negative
    case pastNegative = "past-negative"
    case teForm = "te-form"
    case potential
    case passive
    case causative
    case conditional
    case volitional
    case imperative
    case standalone
    case modifyingANoun = "modifying-a-noun"
    case adverb
    case noun

    var title: String {
      switch self {
      case .presentFuture: "Present/Future"
      case .past: "Past"
      case .negative: "Negative"
      case .pastNegative: "Past Negative"
      case .teForm: "Te-Form"
      case .potential: "Potential"
      case .passive: "Passive"
      case .causative: "Causative"
      case .conditional: "Conditional"
      case .volitional: "Volitional"
      case .imperative: "Imperative"
      case .standalone: "Standalone"
      case .modifyingANoun: "Modifying a Noun"
      case .adverb: "Adverb"
      case .noun: "Noun"
      }
    }
  }
}

private enum JapaneseConjugator {
  static func table(for entry: DictionaryEntry) -> ConjugationTable? {
    if entry.partsOfSpeech.contains(.suruVerb) {
      return suruTable(for: entry)
    }
    if entry.partsOfSpeech.contains(.irregularVerb),
       entry.reading.hasSuffix("くる")
    {
      return kuruTable(for: entry)
    }
    if entry.partsOfSpeech.contains(.ichidanVerb) {
      return ichidanTable(for: entry)
    }
    if entry.partsOfSpeech.contains(.godanVerb) {
      return godanTable(for: entry)
    }
    if entry.partsOfSpeech.contains(.iAdjective) {
      return iAdjectiveTable(for: entry)
    }
    if entry.partsOfSpeech.contains(.naAdjective) {
      return naAdjectiveTable(for: entry)
    }
    return nil
  }

  private static func iAdjectiveTable(for entry: DictionaryEntry) -> ConjugationTable? {
    guard entry.headword != "いい", entry.headword.last == "い", entry.reading.last == "い"
    else { return nil }
    return ConjugationTable(
      title: "い Adjective",
      plain: forms(
        surfaceStem: String(entry.headword.dropLast()),
        readingStem: String(entry.reading.dropLast()),
        rules: [
          .init(.presentFuture, "い"), .init(.past, "かった"),
          .init(.negative, "くない"), .init(.pastNegative, "くなかった"),
          .init(.teForm, "くて"), .init(.adverb, "く"), .init(.noun, "さ"),
        ]
      ),
      polite: []
    )
  }

  private static func naAdjectiveTable(for entry: DictionaryEntry) -> ConjugationTable {
    ConjugationTable(
      title: "な Adjective",
      plain: forms(
        surfaceStem: entry.headword,
        readingStem: entry.reading,
        rules: [
          .init(.standalone, ""), .init(.modifyingANoun, "な"),
          .init(.teForm, "で"), .init(.adverb, "に"), .init(.noun, "さ"),
        ]
      ),
      polite: []
    )
  }

  private static func suruTable(for entry: DictionaryEntry) -> ConjugationTable? {
    guard entry.headword.hasSuffix("する"), entry.reading.hasSuffix("する") else { return nil }
    let surfaceStem = String(entry.headword.dropLast(2))
    let readingStem = String(entry.reading.dropLast(2))
    return ConjugationTable(
      title: "する Verb",
      plain: forms(
        surfaceStem: surfaceStem,
        readingStem: readingStem,
        rules: verbRules(.init(
          presentFuture: "する", past: "した", negative: "しない",
          pastNegative: "しなかった", teForm: "して", potential: "できる",
          passive: "される", causative: "させる", conditional: "すれば",
          volitional: "しよう", imperative: "しろ"
        ))
      ),
      polite: forms(
        surfaceStem: surfaceStem,
        readingStem: readingStem,
        rules: verbRules(.init(
          presentFuture: "します", past: "しました", negative: "しません",
          pastNegative: "しませんでした", teForm: "して", potential: "できます",
          passive: "されます", causative: "させます", conditional: "すれば",
          volitional: "しましょう", imperative: "しなさい"
        ))
      )
    )
  }

  private static func kuruTable(for entry: DictionaryEntry) -> ConjugationTable? {
    let surfaceUsesKanji = entry.headword.hasSuffix("来る")
    let surfaceStem = String(entry.headword.dropLast(2))
    let readingStem = String(entry.reading.dropLast(2))
    let plainReading = VerbSuffixes(
      presentFuture: "くる", past: "きた", negative: "こない",
      pastNegative: "こなかった", teForm: "きて", potential: "こられる",
      passive: "こられる", causative: "こさせる", conditional: "くれば",
      volitional: "こよう", imperative: "こい"
    )
    let politeReading = VerbSuffixes(
      presentFuture: "きます", past: "きました", negative: "きません",
      pastNegative: "きませんでした", teForm: "きて", potential: "こられます",
      passive: "こられます", causative: "こさせます", conditional: "くれば",
      volitional: "きましょう", imperative: "きなさい"
    )
    let plainSurface = surfaceUsesKanji ? VerbSuffixes(
      presentFuture: "来る", past: "来た", negative: "来ない",
      pastNegative: "来なかった", teForm: "来て", potential: "来られる",
      passive: "来られる", causative: "来させる", conditional: "来れば",
      volitional: "来よう", imperative: "来い"
    ) : plainReading
    let politeSurface = surfaceUsesKanji ? VerbSuffixes(
      presentFuture: "来ます", past: "来ました", negative: "来ません",
      pastNegative: "来ませんでした", teForm: "来て", potential: "来られます",
      passive: "来られます", causative: "来させます", conditional: "来れば",
      volitional: "来ましょう", imperative: "来なさい"
    ) : politeReading
    return ConjugationTable(
      title: "Irregular Verb",
      plain: forms(
        surfaceStem: surfaceStem,
        readingStem: readingStem,
        rules: verbRules(surface: plainSurface, reading: plainReading)
      ),
      polite: forms(
        surfaceStem: surfaceStem,
        readingStem: readingStem,
        rules: verbRules(surface: politeSurface, reading: politeReading)
      )
    )
  }

  private static func ichidanTable(for entry: DictionaryEntry) -> ConjugationTable? {
    guard entry.headword.last == "る", entry.reading.last == "る" else { return nil }

    let surfaceStem = String(entry.headword.dropLast())
    let readingStem = String(entry.reading.dropLast())
    return ConjugationTable(
      title: "る Verb",
      plain: forms(
        surfaceStem: surfaceStem,
        readingStem: readingStem,
        rules: verbRules(.init(
          presentFuture: "る", past: "た", negative: "ない", pastNegative: "なかった",
          teForm: "て", potential: "られる", passive: "られる", causative: "させる",
          conditional: "れば", volitional: "よう", imperative: "ろ"
        ))
      ),
      polite: forms(
        surfaceStem: surfaceStem,
        readingStem: readingStem,
        rules: verbRules(.init(
          presentFuture: "ます", past: "ました", negative: "ません",
          pastNegative: "ませんでした", teForm: "て", potential: "られます",
          passive: "られます", causative: "させます", conditional: "れば",
          volitional: "ましょう", imperative: "なさい"
        ))
      )
    )
  }

  private static func godanTable(for entry: DictionaryEntry) -> ConjugationTable? {
    guard let surfaceFinal = entry.headword.last,
          let readingFinal = entry.reading.last,
          let surfaceEnding = GodanEnding(character: surfaceFinal),
          let readingEnding = GodanEnding(character: readingFinal),
          surfaceEnding.character == readingEnding.character
    else { return nil }

    let surfaceStem = String(entry.headword.dropLast())
    let readingStem = String(entry.reading.dropLast())
    let isIkuException = entry.headword.hasSuffix("行く")
    let past = isIkuException ? "った" : surfaceEnding.past
    let teForm = isIkuException ? "って" : surfaceEnding.teForm

    return ConjugationTable(
      title: "う Verb",
      plain: forms(
        surfaceStem: surfaceStem,
        readingStem: readingStem,
        rules: verbRules(.init(
          presentFuture: String(surfaceEnding.character), past: past,
          negative: surfaceEnding.a + "ない", pastNegative: surfaceEnding.a + "なかった",
          teForm: teForm, potential: surfaceEnding.e + "る",
          passive: surfaceEnding.a + "れる", causative: surfaceEnding.a + "せる",
          conditional: surfaceEnding.e + "ば", volitional: surfaceEnding.o + "う",
          imperative: surfaceEnding.e
        ))
      ),
      polite: forms(
        surfaceStem: surfaceStem,
        readingStem: readingStem,
        rules: verbRules(.init(
          presentFuture: surfaceEnding.i + "ます", past: surfaceEnding.i + "ました",
          negative: surfaceEnding.i + "ません", pastNegative: surfaceEnding.i + "ませんでした",
          teForm: teForm, potential: surfaceEnding.e + "ます",
          passive: surfaceEnding.a + "れます", causative: surfaceEnding.a + "せます",
          conditional: surfaceEnding.e + "ば", volitional: surfaceEnding.i + "ましょう",
          imperative: surfaceEnding.i + "なさい"
        ))
      )
    )
  }

  private static func forms(
    surfaceStem: String,
    readingStem: String,
    rules: [ConjugationRule]
  ) -> [ConjugatedForm] {
    rules.map { rule in
      ConjugatedForm(
        id: rule.kind,
        surface: surfaceStem + rule.surfaceSuffix,
        reading: readingStem + rule.readingSuffix
      )
    }
  }

  private static func verbRules(_ suffixes: VerbSuffixes) -> [ConjugationRule] {
    verbRules(surface: suffixes, reading: suffixes)
  }

  private static func verbRules(
    surface: VerbSuffixes,
    reading: VerbSuffixes
  ) -> [ConjugationRule] {
    [
      .init(.presentFuture, surface: surface.presentFuture, reading: reading.presentFuture),
      .init(.past, surface: surface.past, reading: reading.past),
      .init(.negative, surface: surface.negative, reading: reading.negative),
      .init(.pastNegative, surface: surface.pastNegative, reading: reading.pastNegative),
      .init(.teForm, surface: surface.teForm, reading: reading.teForm),
      .init(.potential, surface: surface.potential, reading: reading.potential),
      .init(.passive, surface: surface.passive, reading: reading.passive),
      .init(.causative, surface: surface.causative, reading: reading.causative),
      .init(.conditional, surface: surface.conditional, reading: reading.conditional),
      .init(.volitional, surface: surface.volitional, reading: reading.volitional),
      .init(.imperative, surface: surface.imperative, reading: reading.imperative),
    ]
  }

  private struct VerbSuffixes {
    let presentFuture: String
    let past: String
    let negative: String
    let pastNegative: String
    let teForm: String
    let potential: String
    let passive: String
    let causative: String
    let conditional: String
    let volitional: String
    let imperative: String
  }

  private struct ConjugationRule {
    let kind: ConjugatedForm.Kind
    let surfaceSuffix: String
    let readingSuffix: String

    init(_ kind: ConjugatedForm.Kind, _ suffix: String) {
      self.init(kind, surface: suffix, reading: suffix)
    }

    init(_ kind: ConjugatedForm.Kind, surface: String, reading: String) {
      self.kind = kind
      surfaceSuffix = surface
      readingSuffix = reading
    }
  }

  private struct GodanEnding {
    let character: Character
    let a: String
    let i: String
    let e: String
    let o: String
    let past: String
    let teForm: String

    init?(character: Character) {
      let values: (String, String, String, String, String, String)? = switch character {
      case "う": ("わ", "い", "え", "お", "った", "って")
      case "く": ("か", "き", "け", "こ", "いた", "いて")
      case "ぐ": ("が", "ぎ", "げ", "ご", "いだ", "いで")
      case "す": ("さ", "し", "せ", "そ", "した", "して")
      case "つ": ("た", "ち", "て", "と", "った", "って")
      case "ぬ": ("な", "に", "ね", "の", "んだ", "んで")
      case "ぶ": ("ば", "び", "べ", "ぼ", "んだ", "んで")
      case "む": ("ま", "み", "め", "も", "んだ", "んで")
      case "る": ("ら", "り", "れ", "ろ", "った", "って")
      default: nil
      }
      guard let values else { return nil }
      self.character = character
      (a, i, e, o, past, teForm) = values
    }
  }
}
