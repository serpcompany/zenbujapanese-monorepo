import Observation

@MainActor
@Observable
final class LinkedLines {
  static let laterPage = 25

  private(set) var words: [[JapaneseTextToken]] = []
  @ObservationIgnored private var texts: [String] = []

  var linksMore: Bool { words.count < texts.count }

  func begin(
    _ texts: [String], showing rowsOnScreen: Int?, using analysis: JapaneseTextAnalysisClient
  ) async {
    if texts != self.texts {
      self.texts = texts
      words = []
    }
    await linkPage(of: rowsOnScreen ?? Self.laterPage, using: analysis)
  }

  func linkTheRest(using analysis: JapaneseTextAnalysisClient) async {
    while linksMore, !Task.isCancelled {
      await linkPage(of: Self.laterPage, using: analysis)
    }
  }

  private func linkPage(of size: Int, using analysis: JapaneseTextAnalysisClient) async {
    let (texts, from) = (texts, words.count)
    guard from < texts.count else { return }
    let page = Array(texts[from..<min(texts.count, from + max(1, size))])
    let linked = await analysis.linkedTexts(page, nil)
    guard !Task.isCancelled, texts == self.texts, words.count == from else { return }
    words += linked
  }
}
