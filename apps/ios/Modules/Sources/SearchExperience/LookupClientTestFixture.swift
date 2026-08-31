import Foundation

#if DEBUG
  extension LookupClient {
    static func clientFromProcessArguments(live: LookupClient) -> LookupClient? {
      let arguments = ProcessInfo.processInfo.arguments
      let delaysEveryQuery = arguments.contains("-InjectLookupDelay")
      let delayedQuery: SearchQuery?
      if let argumentIndex = arguments.firstIndex(of: "-InjectLookupDelayQuery"),
        arguments.indices.contains(argumentIndex + 1)
      {
        delayedQuery = SearchQuery(arguments[argumentIndex + 1])
      } else {
        delayedQuery = nil
      }
      guard delaysEveryQuery || delayedQuery != nil else { return nil }

      return LookupClient(
        search: { query in
          if delaysEveryQuery || delayedQuery == query {
            try await Task.sleep(for: .seconds(3))
          }
          return try await live.search(query)
        },
        entry: live.entry,
        entryMatchingForm: live.entryMatchingForm,
        entriesContainingKanji: live.entriesContainingKanji
      )
    }
  }
#endif
