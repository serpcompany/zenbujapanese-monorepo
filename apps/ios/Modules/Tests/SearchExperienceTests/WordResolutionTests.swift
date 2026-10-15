import Foundation
import Testing

@testable import SearchExperience

@Suite("Opening a related or a saved word")
struct WordResolutionTests {
  private func related(
    _ headword: String, _ reading: String, query: String? = nil, targetID: String? = nil
  ) -> DictionaryRelationship {
    DictionaryRelationship(
      query: query ?? headword, headword: headword, reading: reading, summary: "",
      relation: "seeAlso", sourceIdentity: "edrdg.jmdict", sourceReference: nil,
      targetSense: nil, targetID: targetID)
  }

  @Test("a related word that names its entry opens that entry")
  func relatedByEntry() async throws {
    let miru = try await LookupClient.live.relatedWord(
      related("x", "x", targetID: "7f490a9c9c0da94f4e9474f4efe74be1"))
    #expect(miru?.headword == "見る")
    #expect(
      try await LookupClient.live.relatedWord(
        related("見る", "みる", targetID: "00000000000000000000000000000000")) == nil)
  }

  @Test("a related word without one opens the entry written and read the same, or the first found")
  func relatedBySearch() async throws {
    let search = try await LookupClient.live.search(SearchQuery("みる"))
    #expect(search.entries.first?.headword != "診る")
    let written = try await LookupClient.live.relatedWord(related("診る", "みる", query: "みる"))
    #expect(written?.headword == "診る")
    let first = try await LookupClient.live.relatedWord(related("診る", "x", query: "みる"))
    #expect(first?.id == search.entries.first?.id)
    #expect(try await LookupClient.live.relatedWord(related("x", "x", query: "qzxvkj")) == nil)
  }

  @Test("a saved word opens by its entry, else by how it is written and read, else searches its headword")
  func saved() async throws {
    let miru = try #require(
      try await LookupClient.live.entry(LanguageReferenceID(rawValue: "7f490a9c9c0da94f4e9474f4efe74be1")))
    let stored = try await LookupClient.live.savedWord(
      "7f490a9c9c0da94f4e9474f4efe74be1", "anything", "anything")
    #expect(stored == .open(.word(miru, nil)))
    #expect(try await LookupClient.live.savedWord("gone", "見る", "みる") == .open(.word(miru, nil)))
    #expect(try await LookupClient.live.savedWord("gone", "見る", "x") == .search("見る"))
  }
}
