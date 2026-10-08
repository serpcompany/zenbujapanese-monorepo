import Foundation
import Translation
import TranslatorCore

extension SpokenLanguage {
  public var translationLanguage: Locale.Language {
    Locale.Language(identifier: rawValue)
  }
}

extension SentenceTranslationClient {
  public static let onDevice = SentenceTranslationClient { text, language, _ in
    let session = TranslationSession(
      installedSource: language.translationLanguage,
      target: language.counterpart.translationLanguage)
    guard await session.isReady else { throw TranslatorFailure.translationUnavailable }
    do {
      return try await session.translate(text).targetText
    } catch {
      throw TranslatorFailure.translationUnavailable
    }
  }
}
