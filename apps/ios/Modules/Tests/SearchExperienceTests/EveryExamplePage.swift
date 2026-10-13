@testable import SearchExperience

extension ExamplePage {
  static func every(
    upTo limit: Int = .max, _ page: (Int) async throws -> ExamplePage
  ) async rethrows -> ExamplePage {
    let first = try await page(0)
    var examples = first.examples
    while examples.count < min(first.listed, limit) {
      let next = try await page(examples.count)
      guard !next.examples.isEmpty else { break }
      examples += next.examples
    }
    return ExamplePage(examples: examples, listed: first.listed, countText: first.countText)
  }
}
