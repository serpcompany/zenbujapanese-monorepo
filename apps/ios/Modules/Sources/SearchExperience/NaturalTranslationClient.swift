import Foundation
import Translation

struct NaturalTranslationClient: Sendable {
  var availability: @Sendable () async throws -> NaturalTranslationAvailability
  var translateAllInstalled: @Sendable ([String]) async throws -> [String: String]

  init(
    availability: @escaping @Sendable () async throws -> NaturalTranslationAvailability,
    translateAllInstalled: @escaping @Sendable ([String]) async throws -> [String: String]
  ) {
    self.availability = availability
    self.translateAllInstalled = translateAllInstalled
  }

  func translateInstalled(_ source: String) async throws -> String {
    guard let translation = try await translateAllInstalled([source])[source] else {
      throw NaturalTranslationError.languageAssetsUnavailable
    }
    return translation
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
    translateAllInstalled: { sources in
      let session = TranslationSession(
        installedSource: Locale.Language(identifier: "ja"),
        target: Locale.Language(identifier: "en")
      )
      guard await session.isReady else { throw NaturalTranslationError.languageAssetsUnavailable }
      return try await session.translations(for: sources)
    }
  )
}

extension TranslationSession {
  func translations(for sources: [String]) async throws -> [String: String] {
    let requests = sources.enumerated().map { index, source in
      TranslationSession.Request(sourceText: source, clientIdentifier: String(index))
    }
    var bySource: [String: String] = [:]
    for response in try await translations(from: requests) {
      guard let identifier = response.clientIdentifier, let index = Int(identifier),
        sources.indices.contains(index)
      else { continue }
      bySource[sources[index]] = response.targetText
    }
    return bySource
  }
}

enum NaturalTranslationAvailability: Equatable, Sendable {
  case installed
  case downloadable
  case unsupported
}

enum NaturalTranslationError: Error {
  case languageAssetsUnavailable
}
