import Foundation
import FoundationModels

/// An idiom or set expression in recognized text, with its dictionary meaning.
struct ImageTextNote: Hashable, Identifiable, Sendable {
  let phrase: String
  let entry: DictionaryEntry

  var id: String { phrase }
  var meaning: String { entry.meanings.prefix(3).joined(separator: "; ") }
}

/// What a recognized page is, for Translate's Context section.
struct ImageTextInsights: Hashable, Sendable {
  /// A few sentences on what the text is and what it's for.
  let context: String
  let notes: [ImageTextNote]

  /// Notes on idioms inside longer text. An idiom that is a whole paragraph, as in a list of
  /// proverbs, already has its meaning under Translation, so Context doesn't repeat it.
  func notes(notRepeating paragraphs: [ImageTextParagraph]) -> [ImageTextNote] {
    let paragraphTexts = Set(paragraphs.map(\.text))
    return notes.filter { !paragraphTexts.contains($0.phrase) }
  }
}

enum ImageTextExplanationAvailability: Equatable, Sendable {
  case available
  /// Apple Intelligence is off; the learner can turn it on in Settings.
  case appleIntelligenceNotEnabled
  /// The on-device model is still downloading.
  case modelNotReady
  /// This device can't run the on-device model.
  case unsupported
}

/// Explains and, where Apple Translation isn't available, translates recognized text with Apple's
/// on-device language model.
///
/// The model is kept away from word-level claims it gets wrong. Asked to explain idioms, it
/// confidently misread them (背水の陣 as "a surprise attack") and invented grammar; asked to
/// translate them, it went word by word (木を見て森を見ず as "look at the forest"). So it only
/// picks idioms, which are kept when they're dictionary entries and shown with the dictionary's
/// meaning, and those meanings are handed to it whenever it translates or describes the text.
struct ImageTextExplanationClient: Sendable {
  var availability: @Sendable () -> ImageTextExplanationAvailability
  var explain: @Sendable (_ text: String) async throws -> ImageTextInsights
  /// Translations keyed by source text, for devices without Apple Translation.
  var translate: @Sendable (_ sources: [String]) async throws -> [String: String]

  static let unavailable = ImageTextExplanationClient(
    availability: { .unsupported },
    explain: { _ in ImageTextInsights(context: "", notes: []) },
    translate: { _ in [:] }
  )

  static func live(lookupClient: LookupClient) -> ImageTextExplanationClient {
    ImageTextExplanationClient(
      availability: {
        switch SystemLanguageModel.default.availability {
        case .available: .available
        case .unavailable(.appleIntelligenceNotEnabled): .appleIntelligenceNotEnabled
        case .unavailable(.modelNotReady): .modelNotReady
        case .unavailable: .unsupported
        }
      },
      explain: { text in
        try await OnDeviceExplainer(lookupClient: lookupClient).insights(text)
      },
      translate: { sources in
        try await OnDeviceExplainer(lookupClient: lookupClient).translations(sources)
      }
    )
  }
}

private struct OnDeviceExplainer {
  let lookupClient: LookupClient

  /// The on-device model's context is small, so long pages are cut to their opening.
  private static let maximumTextLength = 1_200

  private static let instructions = """
    You help an English-speaking learner read Japanese recognized in a photo.
    """

  /// Translating and describing a learner's own text is a content transformation, so the
  /// permissive guardrails apply; the default ones refused an ordinary novel page about illness.
  /// They cover plain-text responses only, so translation and context aren't guided.
  private static let model = SystemLanguageModel(guardrails: .permissiveContentTransformations)

  private func session() -> LanguageModelSession {
    LanguageModelSession(model: Self.model, instructions: Self.instructions)
  }

  func insights(_ fullText: String) async throws -> ImageTextInsights {
    let text = String(fullText.prefix(Self.maximumTextLength))
    guard !text.isEmpty else { return ImageTextInsights(context: "", notes: []) }

    // Picking idioms is optional: without it, lines that are dictionary entries still get notes.
    let picked = try? await session().respond(
      to: """
        Pick the idioms, proverbs, and set expressions a learner is most likely to miss in \
        this text, copying each exactly as it appears.

        \(text)
        """,
      generating: PhraseSelection.self
    )
    let lines = text.split(separator: "\n").map(String.init)
    var seen = Set<String>()
    var notes: [ImageTextNote] = []
    for phrase in (picked?.content.phrases ?? []) + lines {
      try Task.checkCancellation()
      let phrase = phrase.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !phrase.isEmpty, text.contains(phrase), seen.insert(phrase).inserted,
        let entry = try? await lookupClient.entryMatchingForm(phrase),
        Self.isSetPhrase(phrase, entry: entry)
      else { continue }
      notes.append(ImageTextNote(phrase: phrase, entry: entry))
    }

    let context = try await session().respond(
      to: """
        \(Self.glossary(notes))In two or three plain sentences of English, tell the learner what \
        this text is and what it's for: its kind of writing, where it would appear, and what \
        it's saying overall. Reply with only those sentences.

        Japanese text:
        \(text)
        """
    )
    return ImageTextInsights(
      context: context.content.trimmingCharacters(in: .whitespacesAndNewlines),
      notes: notes
    )
  }

  /// Translates in batches that stay under the model's context, since a page's paragraphs and
  /// lines together can be twice the page's text.
  func translations(_ sources: [String]) async throws -> [String: String] {
    var translations: [String: String] = [:]
    var batch: [String] = []
    for source in sources {
      let length = batch.reduce(0) { $0 + $1.count }
      if !batch.isEmpty, length + source.count > Self.maximumTextLength {
        translations.merge(try await translateBatch(batch)) { current, _ in current }
        batch = []
      }
      batch.append(source)
    }
    if !batch.isEmpty {
      translations.merge(try await translateBatch(batch)) { current, _ in current }
    }
    return translations
  }

  private func translateBatch(_ sources: [String]) async throws -> [String: String] {
    var notes: [ImageTextNote] = []
    for source in sources {
      if let entry = try? await lookupClient.entryMatchingForm(source),
        Self.isSetPhrase(source, entry: entry)
      {
        notes.append(ImageTextNote(phrase: source, entry: entry))
      }
    }
    try Task.checkCancellation()
    let numbered = sources.enumerated().map { "\($0.offset + 1). \($0.element)" }
    let response = try await session().respond(
      to: """
        \(Self.glossary(notes))Translate each numbered Japanese text into natural English. \
        Reply with one line per text, starting with its number and a period, and nothing else.

        \(numbered.joined(separator: "\n"))
        """
    )
    var translations: [String: String] = [:]
    // Accepts "1. text", "1) text", and "**1.** text".
    let numberedLine = /^[\s*]*(\d+)[\s*]*[.):][\s*]*(.+)$/
    for line in response.content.split(separator: "\n") {
      guard let match = try? numberedLine.wholeMatch(in: line),
        let number = Int(match.1), sources.indices.contains(number - 1)
      else { continue }
      translations[sources[number - 1]] = match.2.trimmingCharacters(in: .whitespaces)
    }
    return translations
  }

  /// The model sometimes picks single words such as する, whose form can match an unrelated
  /// entry (擦る, "to rub"). Notes are for set phrases: entries tagged as expressions, or phrases
  /// of several words, such as 背水の陣.
  private static func isSetPhrase(_ phrase: String, entry: DictionaryEntry) -> Bool {
    entry.partsOfSpeech.contains(.expression) || phrase.count >= 4
  }

  private static func glossary(_ notes: [ImageTextNote]) -> String {
    guard !notes.isEmpty else { return "" }
    let lines = notes.map { "\($0.phrase): \($0.meaning)" }
    return """
      Dictionary meanings of idioms in the text. Use these meanings rather than reading the \
      idioms word by word:
      \(lines.joined(separator: "\n"))


      """
  }
}

@Generable
private struct PhraseSelection {
  @Guide(
    description: "Up to 6 idioms, proverbs, or set expressions copied exactly from the text",
    .maximumCount(6))
  var phrases: [String]
}

