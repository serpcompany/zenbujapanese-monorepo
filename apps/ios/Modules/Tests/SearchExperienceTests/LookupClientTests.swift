import XCTest

@testable import SearchExperience

final class LookupClientTests: XCTestCase {
  @MainActor
  func testCancelledLookupDoesNotConsumeTheNextMatchingInjectedFailure() async throws {
    let query = SearchQuery("think")
    let client = LookupClient.injectingOneTimeFailure(
      for: query, live: .freshBundledDatabase())

    // This child cannot enter the MainActor until the current actor turn yields.
    // Cancellation therefore happens before its public lookup request starts.
    let cancelled = Task { @MainActor in try await client.search(query) }
    cancelled.cancel()
    do {
      _ = try await cancelled.value
      XCTFail("A cancelled lookup must report cancellation")
    } catch {
      XCTAssertTrue(error is CancellationError, "Expected cancellation, found \(error)")
    }

    do {
      _ = try await client.search(query)
      XCTFail("The next fresh matching lookup must still receive the one-time failure")
    } catch LookupClientError.injectedFailure {
      // Only the one-time failure satisfies this public lookup contract.
    } catch {
      XCTFail("Expected the one-time injected failure, found \(error)")
    }

    let recovered = try await client.search(query)
    XCTAssertEqual((recovered.best + recovered.additional).filter { $0.headword == "思う" }.count, 1)
  }
}
