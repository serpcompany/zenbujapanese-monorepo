import Testing
@testable import SearchExperience

@Suite("Search frequency evidence orchestration")
struct SearchFrequencyOrchestrationTests {
  @Test("a delayed stale response cannot replace the current query evidence")
  func staleResponseRejected() async throws {
    let oldID = SearchFrequencyTaskID(
      entryIDs: [LanguageReferenceID(rawValue: "00000000000000000000000000000001")],
      refreshID: 1)
    let currentID = SearchFrequencyTaskID(
      entryIDs: [LanguageReferenceID(rawValue: "00000000000000000000000000000002")],
      refreshID: 1)
    var state = SearchFrequencyLoadState()
    state.begin(oldID)
    let delayed = Task {
      try await SearchFrequencyLoader.load(
        oldID,
        using: FrequencyCapability { ids in
          try await Task.sleep(for: .milliseconds(30))
          return FrequencyLookupResult.unavailableResults(
            for: ids, pack: nil, reason: "fixture")
        }
      )
    }
    state.begin(currentID)

    let staleResponse = try await delayed.value
    let acceptedOld = state.commit(staleResponse.results, for: staleResponse.request)
    let acceptedCurrent = state.commit([:], for: currentID)
    #expect(acceptedOld == false)
    #expect(acceptedCurrent)
  }

  @Test("cancelling a delayed request prevents it from producing evidence")
  func cancelledResponseDoesNotComplete() async {
    let request = SearchFrequencyTaskID(
      entryIDs: [LanguageReferenceID(rawValue: "00000000000000000000000000000001")],
      refreshID: 1)
    let delayed = Task {
      try await SearchFrequencyLoader.load(
        request,
        using: FrequencyCapability { ids in
          try? await Task.sleep(for: .milliseconds(50))
          return FrequencyLookupResult.unavailableResults(
            for: ids, pack: nil, reason: "fixture")
        }
      )
    }
    delayed.cancel()

    do {
      _ = try await delayed.value
      Issue.record("A cancelled frequency request unexpectedly produced evidence")
    } catch is CancellationError {
      // Expected: the loader checks cancellation even if its provider returns a value.
    } catch {
      Issue.record("Unexpected cancellation error: \(error)")
    }
  }

  @Test("pack refresh changes task identity and rejects evidence from the prior pack")
  func packRefreshIdentity() {
    let entries = [LanguageReferenceID(rawValue: "00000000000000000000000000000001")]
    let oldPack = SearchFrequencyTaskID(entryIDs: entries, refreshID: 4)
    let newPack = SearchFrequencyTaskID(entryIDs: entries, refreshID: 5)
    #expect(oldPack != newPack)

    var state = SearchFrequencyLoadState()
    state.begin(oldPack)
    state.begin(newPack)
    let acceptedOld = state.commit([:], for: oldPack)
    let acceptedNew = state.commit([:], for: newPack)
    #expect(acceptedOld == false)
    #expect(acceptedNew)
  }
}
