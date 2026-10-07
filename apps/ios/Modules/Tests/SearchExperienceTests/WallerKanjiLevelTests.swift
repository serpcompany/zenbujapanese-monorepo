import Testing

@testable import SearchExperience

@Suite struct WallerKanjiLevelTests {
  private func reference(_ character: String) async throws -> KanjiReferenceEntry {
    let kanji = try #require(KanjiCharacter(character))
    let found = try await KanjiLookupClient.live(lookupClient: .live).entry(kanji)
    return try #require(found)
  }

  @Test func readsWallersLevel() async throws {
    #expect(try await reference("日").wallerJlptLevel == 5)
    #expect(try await reference("猫").wallerJlptLevel == 3)
    #expect(try await reference("彦").wallerJlptLevel == 1)
  }

  @Test func leavesAKanjiWallerDoesntListWithoutALevel() async throws {
    #expect(try await reference("㐆").wallerJlptLevel == nil)
  }

  @Test func keepsTheLevelKanjiDetailShows() async throws {
    #expect(try await reference("日").jlpt == 4)
  }
}
