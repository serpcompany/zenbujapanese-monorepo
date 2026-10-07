@testable import SearchExperience

extension JapaneseTextToken {
  var recordedEntryID: String? {
    entry?.id.rawValue
  }

  var recordedCandidateIDs: [String]? {
    entry == nil && !candidateEntries.isEmpty ? candidateEntries.map(\.id.rawValue) : nil
  }
}
