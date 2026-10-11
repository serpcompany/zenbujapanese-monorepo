import Foundation
import Testing

@testable import SearchExperience

@Suite("Radical lookup")
struct RadicalLookupTests {
  private struct File: Decodable {
    struct Component: Decodable {
      let id: String
    }

    struct Character: Decodable {
      let value: String
      let components: [String]
    }

    let components: [Component]
    let characters: [Character]
  }

  private func file() throws -> File {
    let bytes = try #require(RadicalLookupClient.bundledFile())
    return try JSONDecoder().decode(File.self, from: Data(bytes.dropLast()))
  }

  @Test("chosen radicals narrow to the kanji that have all of them, fewest others first")
  func narrowing() throws {
    let components = Dictionary(
      uniqueKeysWithValues: try file().characters.map { ($0.value, $0.components) })
    let both = try RadicalLookupClient.live.panel(["汁", "母"]).candidates
    #expect(both.contains("海"))
    #expect(both.allSatisfy { Set(components[$0] ?? []).isSuperset(of: ["汁", "母"]) })
    let extras = both.map { components[$0]?.count ?? 0 }
    #expect(extras == extras.sorted())
    #expect(try RadicalLookupClient.live.panel([]).candidates.isEmpty)
  }

  @Test("only radicals that still lead somewhere are offered, under their stroke counts")
  func offeredRadicals() throws {
    let file = try file()
    let components = Dictionary(
      uniqueKeysWithValues: file.characters.map { ($0.value, $0.components) })
    let water = try RadicalLookupClient.live.panel(["汁"])
    let offered = Set(water.groups.flatMap(\.radicals).map(\.id))
    #expect(offered == Set(water.candidates.flatMap { components[$0] ?? [] }))
    let all = try RadicalLookupClient.live.panel([])
    #expect(all.groups.flatMap(\.radicals).count == file.components.count)
    #expect(all.groups.map(\.strokeCount) == all.groups.map(\.strokeCount).sorted())
    #expect(all.groups.first?.label == "1 Stroke")
    #expect(all.groups.dropFirst().first?.label == "2 Strokes")
  }
}
