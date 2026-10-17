import Foundation
import FoundationModels
import Testing
@testable import SearchExperience

@Suite("Image text notes")
struct ImageTextExplanationTests {
  private static let lookupClient = LookupClient(
    search: { _ in throw CancellationError() },
    entry: { _ in nil },
    entryMatchingForm: { form in
      form == "背水の陣" || form == "机上の空論" ? .fixture(id: form, headword: form) : nil
    },
    entriesMatchingForm: { _ in [] },
    entriesContainingKanji: { _ in [] }
  )
  private static let client = ImageTextExplanationClient.live(lookupClient: lookupClient)
  private static let runsTheModel =
    ProcessInfo.processInfo.environment["ZENBU_RUN_LANGUAGE_MODEL"] == "1"
      && client.availability() == .available

  @Test("context is the model's reply, and notes are the set phrases in the text the dictionary has")
  func contextAndNotesFromTheModel() async throws {
    let model = ExplanationModel(
      pickPhrases: { _ in ["背水の陣", "空論", "not in the text"] },
      respond: { _ in "  Three proverbs on a poster.\n" })
    let insights = try await ImageTextExplanationClient.live(
      lookupClient: Self.lookupClient, model: model
    ).explain("木を見て森を見ず\n机上の空論\n背水の陣")
    #expect(insights.context == "Three proverbs on a poster.")
    #expect(Set(insights.notes.map(\.phrase)) == ["背水の陣", "机上の空論"])
  }

  @Test("each numbered line of the model's reply translates the source with that number")
  func translationsByNumber() async throws {
    let model = ExplanationModel(
      pickPhrases: { _ in [] },
      respond: { _ in
        "1. Fighting with one's back to the wall\n**2)** I drink coffee every morning.\n3. Extra"
      })
    let translations = try await ImageTextExplanationClient.live(
      lookupClient: Self.lookupClient, model: model
    ).translate(["背水の陣", "毎朝コーヒーを飲みます"])
    #expect(
      translations == [
        "背水の陣": "Fighting with one's back to the wall",
        "毎朝コーヒーを飲みます": "I drink coffee every morning.",
      ])
  }

  @Test(
    "the on-device model describes the text, and notes are dictionary entries in it",
    .enabled(if: runsTheModel)
  )
  func contextAndNotes() async throws {
    let text = "木を見て森を見ず\n机上の空論\n背水の陣"
    let insights = try await Self.client.explain(text)
    #expect(!insights.context.isEmpty)
    #expect(Set(insights.notes.map(\.phrase)) == ["背水の陣", "机上の空論"])
  }

  @Test(
    "the on-device model returns one translation per source",
    .enabled(if: runsTheModel)
  )
  func translatesEachSource() async throws {
    let sources = ["背水の陣", "毎朝コーヒーを飲みます"]
    let translations = try await Self.client.translate(sources)
    #expect(Set(translations.keys) == Set(sources))
    #expect(translations.values.allSatisfy { !$0.isEmpty })
  }
}
