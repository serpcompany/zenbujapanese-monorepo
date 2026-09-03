import SwiftUI
import UIKit

struct ImageTextFlowView: View {
  @State private var model: ImageTextFlowModel
  @State private var analysisAvailability = JapaneseAnalysisAvailability.full
  let textAnalysisClient: JapaneseTextAnalysisClient
  let close: () -> Void
  let openWord: (DictionaryEntry, ImageTextAsset) -> Void

  init(
    session: ImageTextSession,
    recognitionClient: ImageTextRecognitionClient,
    textAnalysisClient: JapaneseTextAnalysisClient,
    translationClient: NaturalTranslationClient,
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
    self.close = close
    self.openWord = openWord
  }

  var body: some View {
    GeometryReader { geometry in
      VStack(spacing: 0) {
        if analysisAvailability == .reduced {
          Label(
            "Word links are reduced. Download Japanese Analysis in More.",
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
    .task {
      analysisAvailability = await textAnalysisClient.availability()
      await model.load()
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
    case .failed:
      Text("Translation unavailable")
        .accessibilityIdentifier("image-text.translation-unavailable")
        .padding(.vertical, 8)
    }
  }

  @ViewBuilder
  private var shareMenu: some View {
    Menu {
      Button {
        UIPasteboard.general.string = model.copiedText
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
            Button {
              openWord(selectedRegion.entry)
            } label: {
              HStack(spacing: 7) {
                JapaneseRubyText(
                  surface: selectedRegion.entry.headword,
                  reading: selectedRegion.entry.reading,
                  baseFont: .headline,
                  rubyFont: .body
                )
                Text(selectedRegion.entry.summary)
                  .fixedSize(horizontal: false, vertical: true)
              }
              .padding(.horizontal, 12)
              .padding(.vertical, 8)
              .background(.background, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .padding(20)
            .accessibilityLabel(
              "\(selectedRegion.entry.headword), \(selectedRegion.entry.reading), \(selectedRegion.entry.summary)"
            )
            .accessibilityIdentifier("image-text.gloss")
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
