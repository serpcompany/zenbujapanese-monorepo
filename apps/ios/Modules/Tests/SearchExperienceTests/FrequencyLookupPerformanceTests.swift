import Foundation
import Testing
@testable import SearchExperience

@Suite("Frequency lookup performance")
struct FrequencyLookupPerformanceTests {
  @Test("identifiers convert to their 16 raw bytes and reject malformed input")
  func identifierBytes() {
    let id = LanguageReferenceID(rawValue: "000102030405060708090a0b0c0d0eff")
    #expect(id.bytes == Data([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 255]))
    #expect(LanguageReferenceID(rawValue: "abc").bytes == nil)
    #expect(LanguageReferenceID(rawValue: String(repeating: "zz", count: 16)).bytes == nil)
  }

  @Test("a results page of lookups uses the primary key rather than scanning the table")
  func lookupsStayFast() async throws {
    let capability = try FrequencyCapability.freshBundledTUBELEX()
    let results = try await LookupClient.live.search(SearchQuery("いる"))
    let ids = Array(results.entries.prefix(60).map(\.id))
    _ = try await capability.evidence(for: ids)

    let clock = ContinuousClock()
    let elapsed = try await clock.measure {
      _ = try await capability.evidence(for: ids)
    }
    #expect(elapsed < .milliseconds(150), "60 lookups took \(elapsed)")
  }
}
