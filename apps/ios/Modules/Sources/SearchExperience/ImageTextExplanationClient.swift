import Foundation
import FoundationModels

struct ImageTextNote: Hashable, Identifiable, Sendable {
  let phrase: String
  let entry: DictionaryEntry

  var id: String { phrase }
  var meaning: String { entry.meanings.prefix(3).joined(separator: "; ") }
}

struct ImageTextInsights: Hashable, Sendable {
  let context: String
  let notes: [ImageTextNote]

  func notes(notRepeating paragraphs: [ImageTextParagraph]) -> [ImageTextNote] {
    let paragraphTexts = Set(paragraphs.map(\.text))
    return notes.filter { !paragraphTexts.contains($0.phrase) }
  }
}

enum ImageTextExplanationAvailability: Equatable, Sendable {
  case available
  case appleIntelligenceNotEnabled
  case modelNotReady
  case unsupported
}

struct ImageTextExplanationClient: Sendable {
  var availability: @Sendable () -> ImageTextExplanationAvailability
  var explain: @Sendable (_ text: String) async throws -> ImageTextInsights
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

  private static let maximumTextLength = 1_200

  private static let instructions = """
    You help an English-speaking learner read Japanese recognized in a photo.
    """

  private static let model = SystemLanguageModel(guardrails: .permissiveContentTransformations)

  private func session() -> LanguageModelSession {
    LanguageModelSession(model: Self.model, instructions: Self.instructions)
  }

  func insights(_ fullText: String) async throws -> ImageTextInsights {
    let text = String(fullText.prefix(Self.maximumTextLength))
    guard !text.isEmpty else { return ImageTextInsights(context: "", notes: []) }

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
    let numberedLine = /^[\s*]*(\d+)[\s*]*[.):][\s*]*(.+)$/
    for line in response.content.split(separator: "\n") {
      guard let match = try? numberedLine.wholeMatch(in: line),
        let number = Int(match.1), sources.indices.contains(number - 1)
      else { continue }
      translations[sources[number - 1]] = match.2.trimmingCharacters(in: .whitespaces)
    }
    return translations
  }

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

