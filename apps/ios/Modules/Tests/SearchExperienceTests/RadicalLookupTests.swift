import Testing

@testable import SearchExperience

@Suite("Radical lookup")
struct RadicalLookupTests {
  @Test("chosen radicals narrow to the kanji that have all of them, fewest others first")
  func narrowing() throws {
    let catalog = try RadicalLookupClient.live.load()
    let water = try #require(catalog.components.first { $0.id == "汁" })
    let mother = try #require(catalog.components.first { $0.id == "母" })
    let both = catalog.candidates(matching: [water.id, mother.id])
    #expect(both.contains { $0.value == "海" })
    #expect(both.allSatisfy { Set($0.components).isSuperset(of: [water.id, mother.id]) })
    let extras = both.map { $0.components.count }
    #expect(extras == extras.sorted())
    #expect(catalog.candidates(matching: []).isEmpty)
  }

  @Test("only radicals that still lead somewhere are offered")
  func offeredRadicals() throws {
    let catalog = try RadicalLookupClient.live.load()
    let water = try #require(catalog.components.first { $0.id == "汁" })
    let candidates = catalog.candidates(matching: [water.id])
    let offered = Set(catalog.componentGroups(matching: candidates).flatMap(\.values).map(\.id))
    #expect(offered == Set(candidates.flatMap(\.components)))
    #expect(catalog.componentGroups(matching: []).flatMap(\.values).count == catalog.components.count)
  }
}
