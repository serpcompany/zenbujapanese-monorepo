import Foundation
import FoundationModels

/// An idiom or set expression in recognized text, with its dictionary meaning.
struct ImageTextNote: Hashable, Identifiable, Sendable {
  let phrase: String
  let entry: DictionaryEntry

  var id: String { phrase }
  var meaning: String { entry.meanings.prefix(3).joined(separator: "; ") }
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

/// Finds idioms and set expressions in recognized text with Apple's on-device language model.
/// The model only picks phrases: asked to explain them itself, it confidently misread idioms
/// (背水の陣 as "a surprise attack") and invented grammar, even with dictionary definitions in
/// its prompt. So each picked phrase is kept only when it's a dictionary entry, and the note
/// shows that entry's meaning.
struct ImageTextExplanationClient: Sendable {
  var availability: @Sendable () -> ImageTextExplanationAvailability
  var explain: @Sendable (_ text: String) async throws -> [ImageTextNote]

  static let unavailable = ImageTextExplanationClient(
    availability: { .unsupported },
    explain: { _ in [] }
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
        try await notes(in: text, lookupClient: lookupClient)
      }
    )
  }

  /// The on-device model's context is small, so long pages are cut to their opening.
  private static let maximumTextLength = 1_200

  private static let instructions = """
    You help an English-speaking learner read Japanese. From Japanese text recognized in a \
    photo, pick the idioms, proverbs, and set expressions a learner is most likely to miss. \
    Copy each one exactly as it appears in the text.
    """

  private static func notes(
    in fullText: String,
    lookupClient: LookupClient
  ) async throws -> [ImageTextNote] {
    let text = String(fullText.prefix(maximumTextLength))
    guard !text.isEmpty else { return [] }

    let selection = try await LanguageModelSession(instructions: instructions)
      .respond(to: "Japanese text:\n\(text)", generating: PhraseSelection.self)
    var seen = Set<String>()
    var notes: [ImageTextNote] = []
    for phrase in selection.content.phrases {
      try Task.checkCancellation()
      let phrase = phrase.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !phrase.isEmpty, text.contains(phrase), seen.insert(phrase).inserted,
        let entry = try? await lookupClient.entryMatchingForm(phrase)
      else { continue }
      notes.append(ImageTextNote(phrase: phrase, entry: entry))
    }
    return notes
  }
}

@Generable
private struct PhraseSelection {
  @Guide(
    description: "Up to 6 idioms, proverbs, or set expressions copied exactly from the text",
    .maximumCount(6))
  var phrases: [String]
}
