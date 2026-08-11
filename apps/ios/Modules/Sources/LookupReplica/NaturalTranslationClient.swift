import Foundation
import Translation

struct NaturalTranslationClient: Sendable {
  var translate: @Sendable (String) async throws -> String

  static let live = NaturalTranslationClient { source in
    let session = TranslationSession(
      installedSource: Locale.Language(identifier: "ja"),
      target: Locale.Language(identifier: "en")
    )
    guard await session.isReady else { throw NaturalTranslationError.languageAssetsUnavailable }
    return try await session.translate(source).targetText
  }

  #if DEBUG
  static func clientFromProcessArguments() -> NaturalTranslationClient? {
    guard ProcessInfo.processInfo.arguments.contains("-InjectImageTextTranslation") else { return nil }
    return NaturalTranslationClient { source in
      guard !source.isEmpty else { throw NaturalTranslationError.emptySource }
      return "I studied Japanese. Today I saw butterflies in a quiet park. After solving the problem, I will talk with my friends."
    }
  }
  #endif
}

enum NaturalTranslationError: Error {
  case languageAssetsUnavailable
  case emptySource
}
