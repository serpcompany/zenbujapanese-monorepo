@testable import SearchExperience

extension ExamplePage {
  static func every(
    upTo limit: Int = .max, _ page: (ExampleBatch) async throws -> ExamplePage?
  ) async rethrows -> ExamplePage {
    guard let first = try await page(ExampleBatch(from: 0)) else {
      return ExamplePage(examples: [], listed: 0, countText: nil, cutShort: false)
    }
    var examples = first.examples
    while examples.count < min(first.listed, limit) {
      guard let next = try await page(ExampleBatch(from: examples.count)),
        !next.examples.isEmpty
      else { break }
      examples += next.examples
    }
    return ExamplePage(
      examples: examples, listed: first.listed, countText: first.countText, cutShort: false)
  }
}
