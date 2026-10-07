import SwiftUI
@preconcurrency import Translation

struct NativeTranslationPreparationTask: View {
  @State private var configuration = TranslationSession.Configuration(
    source: Locale.Language(identifier: "ja"),
    target: Locale.Language(identifier: "en")
  )
  let requestID: UUID
  let model: ImageTextFlowModel

  var body: some View {
    Color.clear
      .frame(width: 0, height: 0)
      .accessibilityHidden(true)
      .translationTask(configuration) { session in
        guard let request = model.claimPendingTranslationPreparation(id: requestID) else { return }
        do {
          try await session.prepareTranslation()
          guard model.beginPreparedTranslation(request) else { return }
          let translations = try await session.translations(for: request.source)
          model.finishPreparedTranslation(translations, for: request)
        } catch is CancellationError {
          model.cancelPreparedTranslation(request)
        } catch  where TranslationError.alreadyCancelled ~= error {
          model.cancelPreparedTranslation(request)
        } catch {
          model.failPreparedTranslation(request)
        }
      }
  }
}
