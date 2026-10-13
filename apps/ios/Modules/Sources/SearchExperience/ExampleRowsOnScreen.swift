import SwiftUI

extension EnvironmentValues {
  @Entry var exampleRowsOnScreen: Int?
}

struct ExampleRowsOnScreen: ViewModifier {
  let readingAids: ReadingAidPreferences
  @State private var windowHeight: CGFloat = 0

  func body(content: Content) -> some View {
    content
      .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { windowHeight = $0 }
      .environment(
        \.exampleRowsOnScreen,
        JapaneseExampleRowContent.rows(
          fitting: windowHeight, translated: readingAids.showsTranslations))
  }
}

extension JapaneseExampleRowContent {
  static let controlSide: CGFloat = 48
  static let shortestTranslation: CGFloat = 24

  static func rows(fitting height: CGFloat, translated: Bool) -> Int? {
    guard height > 0 else { return nil }
    let shortestRow = controlSide + (translated ? shortestTranslation : 0)
    return Int((height / shortestRow).rounded(.up))
  }
}
