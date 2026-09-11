import Foundation
import Translation

struct NaturalTranslationClient: Sendable {
  var availability: @Sendable () async throws -> NaturalTranslationAvailability
  var translateInstalled: @Sendable (String) async throws -> String

  init(
    availability: @escaping @Sendable () async throws -> NaturalTranslationAvailability,
    translateInstalled: @escaping @Sendable (String) async throws -> String
  ) {
    self.availability = availability
    self.translateInstalled = translateInstalled
  }

  static let live = NaturalTranslationClient(
    availability: {
      let status = await LanguageAvailability().status(
        from: Locale.Language(identifier: "ja"),
        to: Locale.Language(identifier: "en")
      )
      switch status {
      case .installed: return .installed
      case .supported: return .downloadable
      case .unsupported: return .unsupported
      @unknown default: return .unsupported
      }
    },
    translateInstalled: { source in
      let session = TranslationSession(
        installedSource: Locale.Language(identifier: "ja"),
        target: Locale.Language(identifier: "en")
      )
      guard await session.isReady else { throw NaturalTranslationError.languageAssetsUnavailable }
      return try await session.translate(source).targetText
    }
  )
}

enum NaturalTranslationAvailability: Equatable, Sendable {
  case installed
  case downloadable
  case unsupported
}

enum NaturalTranslationError: Error {
  case languageAssetsUnavailable
}
