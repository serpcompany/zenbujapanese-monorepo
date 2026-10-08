import Foundation
import Speech
import TranslatorCore

public enum OnDeviceSpeechAssets {
  public static func transcriber(for language: SpokenLanguage) async throws -> SpeechTranscriber {
    guard SpeechTranscriber.isAvailable,
      let locale = await SpeechTranscriber.supportedLocale(
        equivalentTo: Locale(identifier: language.localeIdentifier))
    else { throw TranslatorFailure.speechRecognitionUnavailable }
    return SpeechTranscriber(
      locale: locale,
      transcriptionOptions: [],
      reportingOptions: [.volatileResults, .fastResults],
      attributeOptions: [.transcriptionConfidence]
    )
  }

  public static func needsDownload(_ languages: [SpokenLanguage]) async throws -> Bool {
    var modules: [any SpeechModule] = []
    for language in languages { modules.append(try await transcriber(for: language)) }
    return await AssetInventory.status(forModules: modules) != .installed
  }

  public static func install(
    _ languages: [SpokenLanguage], progress: @escaping @Sendable (Double) -> Void
  ) async throws {
    var modules: [any SpeechModule] = []
    for language in languages {
      let transcriber = try await transcriber(for: language)
      for locale in transcriber.selectedLocales { _ = try? await AssetInventory.reserve(locale: locale) }
      modules.append(transcriber)
    }
    guard let request = try await AssetInventory.assetInstallationRequest(supporting: modules)
    else { return }
    let observation = request.progress.observe(\.fractionCompleted) { progressReport, _ in
      progress(progressReport.fractionCompleted)
    }
    defer { observation.invalidate() }
    do {
      try await request.downloadAndInstall()
    } catch {
      throw TranslatorFailure.speechRecognitionUnavailable
    }
  }
}
