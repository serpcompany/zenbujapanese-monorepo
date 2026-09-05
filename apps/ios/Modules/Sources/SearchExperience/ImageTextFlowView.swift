import SwiftUI
@preconcurrency import Translation
import UIKit

struct ImageTextFlowView: View {
  @State private var model: ImageTextFlowModel
  @State private var analysisAvailability = JapaneseTextAnalysisAvailability.full
  @State private var recordedCopyRequest: String?
  let textAnalysisClient: JapaneseTextAnalysisClient
  let translationClient: NaturalTranslationClient
  let clipboardClient: ImageTextClipboardClient
  let close: () -> Void
  let openWord: (DictionaryEntry, ImageTextAsset) -> Void

  init(
    session: ImageTextSession,
    recognitionClient: ImageTextRecognitionClient,
    textAnalysisClient: JapaneseTextAnalysisClient,
    translationClient: NaturalTranslationClient,
    clipboardClient: ImageTextClipboardClient,
    close: @escaping () -> Void,
    openWord: @escaping (DictionaryEntry, ImageTextAsset) -> Void
  ) {
    _model = State(
      initialValue: ImageTextFlowModel(
        assets: session.assets,
        recognitionClient: recognitionClient,
        textAnalysisClient: textAnalysisClient,
        translationClient: translationClient
      ))
    self.textAnalysisClient = textAnalysisClient
    self.translationClient = translationClient
    self.clipboardClient = clipboardClient
    self.close = close
    self.openWord = openWord
  }

  var body: some View {
    GeometryReader { geometry in
      VStack(spacing: 0) {
        if analysisAvailability == .reduced {
          Label(
            "Japanese text analysis is unavailable. Reinstall or update Zenbu to restore word links.",
            systemImage: "info.circle"
          )
          .font(.footnote)
          .foregroundStyle(.secondary)
          .padding(.horizontal, 16)
          .padding(.vertical, 8)
          .accessibilityIdentifier("image-text.reduced-analysis")
        }
        if model.canRequestTranslation {
          translation
        }
        pages
      }
      .frame(
        width: geometry.size.width,
        height: geometry.size.height,
        alignment: .top
      )
    }
    .navigationTitle("Photo")
    .navigationBarTitleDisplayMode(.inline)
    .navigationBarBackButtonHidden(true)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        Button(action: close) {
          Image(systemName: "xmark")
        }
        .accessibilityLabel("Close")
        .accessibilityIdentifier("image-text.close")
      }

      ToolbarItemGroup(placement: .topBarTrailing) {
        Button {
          model.showsHighlights.toggle()
        } label: {
          Image(systemName: model.showsHighlights ? "viewfinder" : "viewfinder.circle")
        }
        .accessibilityLabel(
          model.showsHighlights ? "Hide recognition highlights" : "Show recognition highlights"
        )
        .accessibilityIdentifier("image-text.highlights")

        shareMenu
      }
    }
    .overlay(alignment: .topLeading) {
      if let recordedCopyRequest {
        Text("")
          .frame(width: 1, height: 1)
          .accessibilityElement()
          .accessibilityLabel("Copy request \(recordedCopyRequest)")
          .accessibilityIdentifier("image-text.copy-request")
      }
    }
    .task {
      analysisAvailability = await textAnalysisClient.availability()
      await model.load()
    }
    .task(id: model.pendingTranslationPreparation?.id) {
      guard model.pendingTranslationPreparation != nil else { return }
      if let injectedClient = translationClient.preparationClient {
        await model.performPendingTranslationPreparation(using: injectedClient)
      }
    }
    .background {
      if let request = model.pendingTranslationPreparation,
        translationClient.preparationClient == nil
      {
        NativeTranslationPreparationTask(requestID: request.id, model: model)
      }
    }
    .onDisappear { model.suspendTranslation() }
    .alert(
      "No Text Found",
      isPresented: Binding(
        get: { model.noTextAlertPage != nil },
        set: { if !$0 { model.noTextAlertPage = nil } }
      )
    ) {
      Button("OK") { model.noTextAlertPage = nil }
        .accessibilityIdentifier("image-text.no-text-ok")
    } message: {
      Text("Japanese text was not found in this image.")
    }
  }

  @ViewBuilder
  private var translation: some View {
    switch model.translationState {
    case .checkingAvailability:
      ProgressView("Checking translation availability…")
        .padding(.vertical, 8)
        .accessibilityIdentifier("image-text.translation-checking")
    case .preparing:
      ProgressView("Preparing offline translation…")
        .padding(.vertical, 8)
        .accessibilityIdentifier("image-text.translation-preparing")
    case .idle:
      Button("Translate Image Text") {
        model.requestTranslation()
      }
      .buttonStyle(.borderedProminent)
      .padding(.vertical, 8)
      .accessibilityIdentifier("image-text.translate")
    case .translating:
      ProgressView("Translating…")
        .padding(.vertical, 8)
        .accessibilityIdentifier("image-text.translating")
    case .translated(let value):
      VStack(alignment: .leading, spacing: 4) {
        Text("NATURAL TRANSLATION")
          .font(.caption.bold())
          .foregroundStyle(.secondary)
        Text(value)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityIdentifier("image-text.translation")
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 8)
    case .cancelled:
      translationRecovery(
        title: "Translation download cancelled",
        message: "Your recognized text is unchanged. Try again when you’re ready."
      )
    case .unsupported:
      translationStatus(
        title: "Translation not supported",
        message: "Japanese to English translation isn’t supported on this device.",
        retryable: false,
        statusIdentifier: "image-text.translation-unsupported"
      )
    case .preparationFailed:
      translationRecovery(
        title: "Translation download failed",
        message: "Check your connection and try downloading Apple’s language resources again."
      )
    case .failed:
      translationRecovery(
        title: "Translation failed",
        message: "Your recognized text is unchanged. Try again."
      )
    }
  }

  private func translationRecovery(
    title: LocalizedStringKey,
    message: LocalizedStringKey
  ) -> some View {
    translationStatus(
      title: title,
      message: message,
      retryable: true,
      statusIdentifier: "image-text.translation-recovery"
    )
  }

  private func translationStatus(
    title: LocalizedStringKey,
    message: LocalizedStringKey,
    retryable: Bool,
    statusIdentifier: String
  ) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Label(title, systemImage: "translate")
        .font(.headline)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityIdentifier(statusIdentifier)
      Text(message)
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
      if retryable {
        Button("Retry", systemImage: "arrow.clockwise") {
          model.retryTranslation()
        }
        .accessibilityIdentifier("image-text.translation-retry")
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 16)
    .padding(.vertical, 8)
  }

  @ViewBuilder
  private var shareMenu: some View {
    Menu {
      Button {
        let text = model.copiedText
        recordedCopyRequest = clipboardClient.copy(text)
      } label: {
        Label("Copy Text", systemImage: "document.on.document")
      }
      .accessibilityIdentifier("image-text.copy-text")

      if let payload = model.selectedSharePayload {
        if let sharedImage = UIImage(data: payload.data) {
          let image = Image(uiImage: sharedImage)
          ShareLink(
            item: image,
            preview: SharePreview(payload.name, image: image)
          ) {
            Label("Share Image", systemImage: "photo")
          }
          .accessibilityLabel("Share Image, selected image \(payload.name)")
          .accessibilityIdentifier("image-text.share-image")
        }
      }
    } label: {
      Image(systemName: "square.and.arrow.up")
    }
    .accessibilityLabel("Share")
    .accessibilityIdentifier("image-text.share")
  }

  private var pages: some View {
    TabView(selection: selectedPage) {
      ForEach(Array(model.pages.enumerated()), id: \.element.id) { index, page in
        pageContent(page)
          .tag(index)
          .accessibilityHidden(index != model.selectedPage)
      }
    }
    .tabViewStyle(.page(indexDisplayMode: model.pages.count > 1 ? .automatic : .never))
    .indexViewStyle(.page(backgroundDisplayMode: .interactive))
    .accessibilityIdentifier("image-text.pages")
  }

  private var selectedPage: Binding<Int> {
    Binding {
      model.selectedPage
    } set: { index in
      model.selectPage(index)
    }
  }

  @ViewBuilder
  private func pageContent(_ modelPage: ImageTextFlowModel.Page) -> some View {
    switch modelPage.state {
    case .loading:
      ProgressView("Recognizing Japanese text…")
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityIdentifier("image-text.loading")
    case .failed:
      ContentUnavailableView(
        "Image text unavailable",
        systemImage: "text.viewfinder",
        description: Text("Close and choose the file again.")
      )
    case .loaded(let page):
      ImageTextCanvas(
        page: page,
        showsHighlights: model.showsHighlights,
        selectedRegion: model.selectedRegion,
        selectRegion: { model.selectedRegion = $0 },
        openWord: {
          openWord($0, page.asset)
        }
      )
    }
  }
}

private struct NativeTranslationPreparationTask: View {
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
          let response = try await session.translate(request.source)
          model.finishPreparedTranslation(response.targetText, for: request)
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

private struct ImageTextCanvas: View {
  let page: ImageTextPage
  let showsHighlights: Bool
  let selectedRegion: ImageTextRegion?
  let selectRegion: (ImageTextRegion) -> Void
  let openWord: (DictionaryEntry) -> Void

  var body: some View {
    GeometryReader { geometry in
      if let image = UIImage(data: page.asset.data) {
        let imageRect = aspectFitRect(imageSize: image.size, container: geometry.size)
        ZStack(alignment: .topLeading) {
          Image(uiImage: image)
            .resizable()
            .scaledToFit()
            .frame(width: geometry.size.width, height: geometry.size.height)
            .accessibilityHidden(true)

          if showsHighlights {
            ForEach(page.regions) { region in
              let rect = displayRect(region.boundingBox, in: imageRect)
              Button {
                selectRegion(region)
              } label: {
                Rectangle()
                  .fill(ZenbuTheme.recognitionHighlight.opacity(0.32))
                  .overlay(Rectangle().stroke(ZenbuTheme.recognitionHighlight, lineWidth: 1))
              }
              .buttonStyle(.plain)
              .frame(width: max(rect.width, 28), height: max(rect.height, 28))
              .position(x: rect.midX, y: rect.midY)
              .accessibilityLabel("Recognized \(region.surface)")
              .accessibilityIdentifier("image-text.region.\(region.surface)")
            }
          }

          if let selectedRegion {
            Group {
              if let entry = selectedRegion.entry {
                Button {
                  openWord(entry)
                } label: {
                  imageTextGloss(entry)
                }
                .accessibilityLabel("\(entry.headword), \(entry.reading), \(entry.summary)")
                .accessibilityIdentifier("image-text.gloss")
              } else {
                Menu {
                  ForEach(selectedRegion.candidateEntries) { candidate in
                    Button {
                      openWord(candidate)
                    } label: {
                      Text("\(candidate.headword) (\(candidate.reading)) — \(candidate.summary)")
                    }
                  }
                } label: {
                  Label(
                    "\(selectedRegion.surface): \(selectedRegion.candidateEntries.count) dictionary entries",
                    systemImage: "ellipsis.circle"
                  )
                  .padding(.horizontal, 12)
                  .padding(.vertical, 8)
                  .background(.background, in: RoundedRectangle(cornerRadius: 12))
                }
                .accessibilityLabel("\(selectedRegion.surface), choose dictionary entry")
                .accessibilityHint(
                  "Shows \(selectedRegion.candidateEntries.count) possible dictionary entries"
                )
                .accessibilityIdentifier("image-text.candidates")
              }
            }
            .buttonStyle(.plain)
            .padding(20)
          }

          Text("")
            .frame(width: 1, height: 1)
            .accessibilityElement()
            .accessibilityLabel(
              "Recognized text \(page.observations.map(\.text).joined(separator: " "))"
            )
            .accessibilityIdentifier("image-text.raw-text")

          Text("")
            .frame(width: 1, height: 1)
            .accessibilityElement()
            .accessibilityLabel(page.asset.name)
            .accessibilityIdentifier("image-text.current-page")
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Imported image \(page.asset.name)")
      }
    }
  }

  private func imageTextGloss(_ entry: DictionaryEntry) -> some View {
    HStack(spacing: 7) {
      JapaneseRubyText(
        surface: entry.headword,
        reading: entry.reading,
        baseFont: .headline,
        rubyFont: .body
      )
      Text(entry.summary)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
    .background(.background, in: RoundedRectangle(cornerRadius: 12))
  }

  private func aspectFitRect(imageSize: CGSize, container: CGSize) -> CGRect {
    let scale = min(container.width / imageSize.width, container.height / imageSize.height)
    let size = CGSize(width: imageSize.width * scale, height: imageSize.height * scale)
    return CGRect(
      x: (container.width - size.width) / 2,
      y: (container.height - size.height) / 2,
      width: size.width,
      height: size.height
    )
  }

  private func displayRect(_ normalized: CGRect, in imageRect: CGRect) -> CGRect {
    CGRect(
      x: imageRect.minX + normalized.minX * imageRect.width,
      y: imageRect.minY + (1 - normalized.maxY) * imageRect.height,
      width: normalized.width * imageRect.width,
      height: normalized.height * imageRect.height
    )
  }
}
