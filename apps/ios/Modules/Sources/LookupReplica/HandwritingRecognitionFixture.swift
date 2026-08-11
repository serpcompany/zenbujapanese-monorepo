import Foundation

#if DEBUG
enum HandwritingRecognitionFixture {
  static func clientFromProcessArguments() -> HandwritingRecognitionClient? {
    let arguments = ProcessInfo.processInfo.arguments
    guard let marker = arguments.firstIndex(of: "-HandwritingRecognitionFixture"),
      arguments.indices.contains(marker + 1)
    else { return nil }

    let sequences: [[String]] = switch arguments[marker + 1] {
    case "cho": [["丁", "十", "下"]]
    case "pending": [["丁", "十", "下"], ["一", "二", "十"]]
    case "recover": [[], ["丁", "十", "下"]]
    default: [[]]
    }
    let state = State(sequences: sequences)
    return HandwritingRecognitionClient { _ in await state.nextCandidates() }
  }

  private actor State {
    let sequences: [[String]]
    private var index = 0

    init(sequences: [[String]]) { self.sequences = sequences }

    func nextCandidates() -> [HandwritingCandidate] {
      guard !sequences.isEmpty else { return [] }
      let values = sequences[min(index, sequences.count - 1)]
      index += 1
      return values.map(HandwritingCandidate.init(value:))
    }
  }
}
#endif
