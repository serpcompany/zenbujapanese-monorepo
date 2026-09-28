import Foundation
import Testing
@testable import SearchExperience

@Suite("Image text notes")
struct ImageTextExplanationTests {
  /// Knows only two of the three proverbs, so the test sees which phrases the model keeps.
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

  /// Runs only where Apple Intelligence is available, such as a Mac with it turned on.
  @Test(
    "notes are dictionary entries that appear in the text",
    .enabled(if: client.availability() == .available)
  )
  func notesAreDictionaryEntries() async throws {
    let text = "木を見て森を見ず\n机上の空論\n背水の陣"
    let notes = try await Self.client.explain(text)
    #expect(!notes.isEmpty)
    #expect(notes.allSatisfy { ["背水の陣", "机上の空論"].contains($0.phrase) })
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
