import SwiftUI
import UIKit

struct ImageTextFlowView: View {
  @State private var model: ImageTextFlowModel
  @State private var sharedAsset: ImageTextAsset?
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
    self.close = close
    self.openWord = openWord
  }

  var body: some View {
    GeometryReader { geometry in
      VStack(spacing: 0) {
        toolbar
        if model.canRequestTranslation { translation }
        page
          .padding(
            .bottom,
            model.pages.count > 1 ? 0 : SearchExperienceLayout.bottomNavigationContentClearance
          )
        if model.pages.count > 1 {
          pageIndicators
            .padding(.bottom, SearchExperienceLayout.bottomNavigationContentClearance)
        }
      }
      .frame(
        width: geometry.size.width,
        height: geometry.size.height,
        alignment: .top
      )
    }
    .accessibilityHidden(sharedAsset != nil)
    .background(ZenbuTheme.background)
    .toolbar(.hidden, for: .navigationBar)
    .task { await model.load() }
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
    .sheet(item: $sharedAsset, onDismiss: { sharedAsset = nil }) { asset in
      ImageActivityView(asset: asset)
        .ignoresSafeArea()
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
      .tint(ZenbuTheme.selectedTab)
      .foregroundStyle(ZenbuTheme.primaryForeground)
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
          .foregroundStyle(ZenbuTheme.secondaryText)
        Text(value)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityIdentifier("image-text.translation")
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 8)
      .background(ZenbuTheme.row)
    case .failed:
      Text("Translation unavailable")
        .accessibilityIdentifier("image-text.translation-unavailable")
        .padding(.vertical, 8)
    }
  }

  private var toolbar: some View {
    HStack(spacing: 22) {
      Button(action: close) {
        Image(systemName: "xmark")
      }
      .accessibilityLabel("Close")
      .accessibilityIdentifier("image-text.close")
      Spacer()
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
    .buttonStyle(.plain)
    .font(.system(size: 23))
    .foregroundStyle(ZenbuTheme.selectedTab)
    .padding(.horizontal, 16)
    .frame(height: 49)
    .background(ZenbuTheme.card)
  }

  @ViewBuilder
  private var shareMenu: some View {
    Menu {
      Button {
        UIPasteboard.general.string = model.copiedText
      } label: {
        Label("Copy Text", systemImage: "doc.on.doc")
      }
      .accessibilityIdentifier("image-text.copy-text")

      if model.pages.indices.contains(model.selectedPage) {
        let asset = model.pages[model.selectedPage].asset
        Button {
          sharedAsset = asset
        } label: {
          Label("Share Image", systemImage: "photo")
        }
        .accessibilityIdentifier("image-text.share-image")
      }
    } label: {
      Image(systemName: "square.and.arrow.up")
    }
    .accessibilityLabel("Share")
    .accessibilityIdentifier("image-text.share")
  }

  @ViewBuilder
  private var page: some View {
    if model.pages.indices.contains(model.selectedPage) {
      switch model.pages[model.selectedPage].state {
      case .loading:
        ProgressView("Recognizing Japanese text…")
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .accessibilityIdentifier("image-text.loading")
      case .failed:
        VStack(spacing: 14) {
          Text("Image text unavailable")
          Text("Close and choose the file again.")
            .foregroundStyle(ZenbuTheme.secondaryText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      case .loaded(let page):
        ImageTextCanvas(
          page: page,
          showsHighlights: model.showsHighlights,
          selectedRegion: model.selectedRegion,
          selectRegion: { model.selectedRegion = $0 },
          openWord: {
            model.selectedRegion = nil
            openWord($0, page.asset)
          }
        )
      }
    }
  }

  private var pageIndicators: some View {
    HStack(spacing: 12) {
      ForEach(model.pages.indices, id: \.self) { index in
        Button {
          model.selectPage(index)
        } label: {
          Circle()
            .fill(
              index == model.selectedPage
                ? ZenbuTheme.foreground : ZenbuTheme.mutedForeground.opacity(0.3)
            )
            .frame(width: 10, height: 10)
            .frame(width: 36, height: 36)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Page \(index + 1) of \(model.pages.count)")
        .accessibilityIdentifier("image-text.page.\(index + 1)")
      }
    }
    .frame(height: 38)
  }
}

private struct ImageActivityView: UIViewControllerRepresentable {
  let asset: ImageTextAsset

  func makeUIViewController(context: Context) -> UIActivityViewController {
    let item: Any = UIImage(data: asset.data) ?? asset.data
    return UIActivityViewController(activityItems: [item], applicationActivities: nil)
  }

  func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
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
                  .fill(ZenbuTheme.selectedTab.opacity(0.32))
                  .overlay(Rectangle().stroke(ZenbuTheme.selectedTab, lineWidth: 1))
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
                VStack(alignment: .leading, spacing: 1) {
                  Text(selectedRegion.entry.reading).font(.caption2)
                  Text(selectedRegion.entry.headword).font(.headline)
                }
                Text(selectedRegion.entry.summary)
                  .lineLimit(1)
                Image(systemName: "chevron.right")
              }
              .padding(.horizontal, 12)
              .padding(.vertical, 8)
              .background(ZenbuTheme.row, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .foregroundStyle(ZenbuTheme.foreground)
            .padding(20)
            .accessibilityLabel(
              "\(selectedRegion.entry.headword), \(selectedRegion.entry.reading), \(selectedRegion.entry.summary)"
            )
            .accessibilityIdentifier("image-text.gloss")
          }

          Text(page.observations.map(\.text).joined(separator: "\n"))
            .frame(width: 1, height: 1)
            .opacity(0.01)
            .accessibilityLabel(
              "Recognized text \(page.observations.map(\.text).joined(separator: " "))"
            )
            .accessibilityIdentifier("image-text.raw-text")

          Text(page.asset.name)
            .frame(width: 1, height: 1)
            .opacity(0.01)
            .accessibilityIdentifier("image-text.current-page")
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Imported image \(page.asset.name)")
      }
    }
    .background(ZenbuTheme.background)
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
