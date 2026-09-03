import Foundation
import Translation

struct NaturalTranslationClient: Sendable {
  var availability: @Sendable () async throws -> NaturalTranslationAvailability
  var translateInstalled: @Sendable (String) async throws -> String
  var preparationClient: NaturalTranslationPreparationClient?

  init(translate: @escaping @Sendable (String) async throws -> String) {
    availability = { .installed }
    translateInstalled = translate
    preparationClient = nil
  }

  init(
    availability: @escaping @Sendable () async throws -> NaturalTranslationAvailability,
    translateInstalled: @escaping @Sendable (String) async throws -> String,
    preparationClient: NaturalTranslationPreparationClient? = nil
  ) {
    self.availability = availability
    self.translateInstalled = translateInstalled
    self.preparationClient = preparationClient
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

  #if DEBUG
    static func clientFromProcessArguments() -> NaturalTranslationClient? {
      let arguments = ProcessInfo.processInfo.arguments
      let translation =
        "I studied Japanese. Today I saw butterflies in a quiet park. After solving the problem, I will talk with my friends."
      if arguments.contains("-InjectImageTextTranslationUnsupported") {
        return NaturalTranslationClient(
          availability: { .unsupported },
          translateInstalled: { _ in throw NaturalTranslationError.languageAssetsUnavailable }
        )
      }
      if arguments.contains("-InjectImageTextTranslationPreparing") {
        return NaturalTranslationClient(
          availability: { .downloadable },
          translateInstalled: { _ in throw NaturalTranslationError.languageAssetsUnavailable },
          preparationClient: NaturalTranslationPreparationClient(
            prepare: { try await Task.sleep(for: .seconds(30)) },
            translate: { _ in translation }
          )
        )
      }
      if arguments.contains("-InjectImageTextTranslationCancelled") {
        return NaturalTranslationClient(
          availability: { .downloadable },
          translateInstalled: { _ in throw NaturalTranslationError.languageAssetsUnavailable },
          preparationClient: NaturalTranslationPreparationClient(
            prepare: { throw CancellationError() },
            translate: { _ in translation }
          )
        )
      }
      if arguments.contains("-InjectImageTextTranslationPreparationFailure") {
        return NaturalTranslationClient(
          availability: { .downloadable },
          translateInstalled: { _ in throw NaturalTranslationError.languageAssetsUnavailable },
          preparationClient: NaturalTranslationPreparationClient(
            prepare: { throw NaturalTranslationError.languageAssetsUnavailable },
            translate: { _ in translation }
          )
        )
      }
      if arguments.contains("-InjectImageTextTranslationPrepared") {
        return NaturalTranslationClient(
          availability: { .downloadable },
          translateInstalled: { _ in throw NaturalTranslationError.languageAssetsUnavailable },
          preparationClient: NaturalTranslationPreparationClient(
            prepare: {},
            translate: { source in
              guard !source.isEmpty else { throw NaturalTranslationError.emptySource }
              return translation
            }
          )
        )
      }
      guard arguments.contains("-InjectImageTextTranslation") else { return nil }
      return NaturalTranslationClient(translate: { source in
        guard !source.isEmpty else { throw NaturalTranslationError.emptySource }
        return translation
      })
    }
  #endif
}

enum NaturalTranslationAvailability: Equatable, Sendable {
  case installed
  case downloadable
  case unsupported
}

struct NaturalTranslationPreparationClient: Sendable {
  var prepare: @Sendable () async throws -> Void
  var translate: @Sendable (String) async throws -> String
}

enum NaturalTranslationError: Error {
  case languageAssetsUnavailable
  case emptySource
}
