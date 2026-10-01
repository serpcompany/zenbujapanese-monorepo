import Foundation
import FoundationModels
import Testing
@testable import SearchExperience

@Suite("Image text notes")
struct ImageTextExplanationTests {
  private static let client = ImageTextExplanationClient.live(
    lookupClient: LookupClient(
      search: { _ in throw CancellationError() },
      entry: { _ in nil },
      entryMatchingForm: { form in
        form == "背水の陣" || form == "机上の空論" ? entry(form) : nil
      },
      entriesMatchingForm: { _ in [] },
      entriesContainingKanji: { _ in [] }
    )
  )

  @Test(
    "context describes the text, and notes are dictionary entries in it",
    .enabled(if: client.availability() == .available)
  )
  func contextAndNotes() async throws {
    guard await Self.modelRuns() else { return }
    let text = "木を見て森を見ず\n机上の空論\n背水の陣"
    let insights = try await Self.client.explain(text)
    #expect(!insights.context.isEmpty)
    #expect(Set(insights.notes.map(\.phrase)) == ["背水の陣", "机上の空論"])
  }

  @Test(
    "on-device translation returns one translation per source",
    .enabled(if: client.availability() == .available)
  )
  func translatesEachSource() async throws {
    guard await Self.modelRuns() else { return }
    let sources = ["背水の陣", "毎朝コーヒーを飲みます"]
    let translations = try await Self.client.translate(sources)
    #expect(Set(translations.keys) == Set(sources))
    #expect(translations.values.allSatisfy { !$0.isEmpty })
  }

  private static func modelRuns() async -> Bool {
    (try? await LanguageModelSession().respond(to: "Reply with OK.")) != nil
  }

  private static func entry(_ headword: String) -> DictionaryEntry {
    DictionaryEntry(
      id: LanguageReferenceID(rawValue: headword),
      noteID: WordNoteID(rawValue: headword),
      sourceProvenances: [
        LanguageReferenceProvenance(sourceIdentity: "fixture", sourceRecordID: headword)
      ],
      reading: headword,
      headword: headword,
      summary: headword,
      meanings: [headword],
      partsOfSpeech: [],
      writtenForms: [],
      readingForms: [],
      senses: [],
      relationships: [],
      pitchAccent: nil,
      isCommon: false
    )
  }
}
