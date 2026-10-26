import Foundation
import Testing

@testable import SearchExperience

@Suite("The Sudachi pack the app analyzes with, as the shared cases say")
struct SudachiPackChoiceTests {
  private static func object(_ url: URL) throws -> [String: Any] {
    try #require(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
  }

  @Test("each case's catalog gives the pack the suite names, or is refused")
  func choosesAsTheSuiteSays() throws {
    let suite = try Self.object(DetailConformance.suiteURL("sudachi-pack.json"))
    let committed = try Self.object(
      try #require(
        BundledData.bundle.url(forResource: "LanguageTechnologyPackCatalog", withExtension: "json")
      ))
    let pack = try #require((committed["packs"] as? [[String: Any]])?.first)
    let cases = try #require(suite["cases"] as? [[String: Any]])
    #expect(cases.count > 5)
    for item in cases {
      var catalog = committed
      catalog["schemaVersion"] = item["schemaVersion"] ?? committed["schemaVersion"]
      catalog["packs"] = (item["packs"] as? [[String: Any]] ?? []).map {
        pack.merging($0) { $1 }
      }
      let decoded = try JSONDecoder().decode(
        LanguageTechnologyPackCatalog.self,
        from: JSONSerialization.data(withJSONObject: catalog))
      let chosen = (try? LanguageTechnologyPackCatalog.checked(decoded))?.bundledDefault
      #expect(
        chosen?.packID.rawValue == item["analyzesWith"] as? String,
        "\(item["covers"] as? String ?? "")")
    }
  }
}
