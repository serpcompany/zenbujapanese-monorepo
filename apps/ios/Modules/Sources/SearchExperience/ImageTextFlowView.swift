import SwiftUI
@preconcurrency import Translation
import UIKit

struct ImageTextFlowView: View {
  @State private var model: ImageTextFlowModel
  @State private var analysisAvailability = JapaneseTextAnalysisAvailability.full
  @AppStorage("image-text.view-mode") private var mode = ImageTextViewMode.both
  /// The line (or, in Text, the paragraph) the learner is on: outlined on the photo in Both.
  @State private var activeLineID: Int?
  @Binding private var presentedWord: RecognizedWordSheetRequest?
  let textAnalysisClient: JapaneseTextAnalysisClient
  let translationClient: NaturalTranslationClient
  let clipboardClient: ImageTextClipboardClient
  let close: () -> Void

  init(
    session: ImageTextSession,
    recognitionClient: ImageTextRecognitionClient,
    textAnalysisClient: JapaneseTextAnalysisClient,
    translationClient: NaturalTranslationClient,
    explanationClient: ImageTextExplanationClient,
    clipboardClient: ImageTextClipboardClient,
    presentedWord: Binding<RecognizedWordSheetRequest?>,
    close: @escaping () -> Void
  ) {
    _model = State(
      initialValue: ImageTextFlowModel(
        assets: session.assets,
        recognitionClient: recognitionClient,
        textAnalysisClient: textAnalysisClient,
        translationClient: translationClient,
        explanationClient: explanationClient
      ))
    _presentedWord = presentedWord
    self.textAnalysisClient = textAnalysisClient
    self.translationClient = translationClient
    self.clipboardClient = clipboardClient
    self.close = close
  }

  var body: some View {
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
      Picker("View", selection: $mode) {
        ForEach(ImageTextViewMode.allCases) { mode in
          Text(mode.title).tag(mode)
        }
      }
      .pickerStyle(.segmented)
      .padding(.horizontal, 16)
      .padding(.vertical, 8)
      .accessibilityIdentifier("image-text.mode")
      pages
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
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

      // One toolbar for every view, so switching views never moves or changes its buttons.
      ToolbarItem(placement: .topBarTrailing) {
        moreMenu
      }
    }
    .task {
      analysisAvailability = await textAnalysisClient.availability()
      await model.load()
    }
    .background {
      if let request = model.pendingTranslationPreparation {
        NativeTranslationPreparationTask(requestID: request.id, model: model)
      }
    }
    .onDisappear { model.suspendTranslation() }
    .onChange(of: presentedWord?.id) { _, wordID in
      if wordID == nil { model.selectedRegion = nil }
    }
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

  /// Download, progress, and failure states for the natural translation. A finished translation
  /// is shown by each mode itself.
  @ViewBuilder
  private var translationStatus: some View {
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
    case .translated:
      EmptyView()
    case .cancelled:
      translationRecovery(
        title: "Translation download cancelled",
        message: "Your recognized text is unchanged. Try again when you’re ready."
      )
    case .unsupported:
      translationStatusMessage(
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
    translationStatusMessage(
      title: title,
      message: message,
      retryable: true,
      statusIdentifier: "image-text.translation-recovery"
    )
  }

  private func translationStatusMessage(
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
  }

  private var moreMenu: some View {
    Menu {
      Button {
        let text = model.copiedText
        clipboardClient.copy(text)
      } label: {
        Label("Copy Text", systemImage: "document.on.document")
      }
      .accessibilityIdentifier("image-text.copy-text")

      if let payload = model.selectedSharePayload,
        let sharedImage = UIImage(data: payload.data)
      {
        let image = Image(uiImage: sharedImage)
        ShareLink(
          item: image,
          preview: SharePreview(payload.name, image: image)
        ) {
          Label("Share Image", systemImage: "square.and.arrow.up")
        }
        .accessibilityLabel("Share Image, selected image \(payload.name)")
        .accessibilityIdentifier("image-text.share-image")
      }

      Divider()

      Toggle(isOn: $model.showsHighlights) {
        Label("Show Words on Image", systemImage: "viewfinder")
      }
      .accessibilityIdentifier("image-text.highlights")
    } label: {
      Image(systemName: "ellipsis")
    }
    .accessibilityLabel("More")
    .accessibilityIdentifier("image-text.more")
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
      activeLineID = nil
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
      switch mode {
      case .photo:
        ImageTextCanvas(
          page: page,
          showsRegions: model.showsHighlights,
          selectedRegion: model.selectedRegion,
          outlinedLineID: nil,
          selectRegion: { region in select(region, in: page) }
        )
      case .both:
        ImageTextLineCards(
          page: page,
          model: model,
          textAnalysisClient: textAnalysisClient,
          highlightedEntry: presentedWord?.entry,
          isWordSheetPresented: presentedWord != nil,
          selectedRegion: model.selectedRegion,
          activeLineID: $activeLineID,
          selectRegion: { region in select(region, in: page) },
          openWord: { entry, lineID in open(entry, in: page, lineID: lineID) },
          openCandidates: { surface, candidates, lineID in
            open(surface, candidates: candidates, in: page, lineID: lineID)
          }
        )
      case .text:
        ImageTextReader(
          page: page,
          model: model,
          textAnalysisClient: textAnalysisClient,
          highlightedEntry: presentedWord?.entry,
          activeParagraphID: activeLineID,
          isWordSheetPresented: presentedWord != nil,
          openWord: { entry, paragraphID in open(entry, in: page, lineID: paragraphID) },
          openCandidates: { surface, candidates, paragraphID in
            open(surface, candidates: candidates, in: page, lineID: paragraphID)
          }
        )
      case .translate:
        translatePage(page)
      }
    }
  }

  /// Translate: the page's natural translation, then context on what the text is.
  private func translatePage(_ page: ImageTextPage) -> some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 32) {
        VStack(alignment: .leading, spacing: 16) {
          sectionHeader("Translation")
          translationStatus
          if case .translated = model.translationState {
            ForEach(page.paragraphs) { paragraph in
              VStack(alignment: .leading, spacing: 6) {
                Text(paragraph.text)
                  .font(.subheadline)
                  .foregroundStyle(.secondary)
                Text(model.translation(of: paragraph.text) ?? "")
                  .accessibilityIdentifier("image-text.translation.\(paragraph.id)")
              }
              .frame(maxWidth: .infinity, alignment: .leading)
              .textSelection(.enabled)
            }
            if model.translatesOnDevice {
              sectionFootnote("Translated on this device by Apple Intelligence.")
            }
          }
        }
        context(page)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(16)
    }
    .accessibilityIdentifier("image-text.translation")
    // Choosing Translate is the request, so it starts without another tap.
    .task(id: page.asset.id) {
      if case .idle = model.translationState { model.requestTranslation() }
      model.requestExplanation()
    }
  }

  @ViewBuilder
  private func context(_ page: ImageTextPage) -> some View {
    switch model.explanationState {
    case .idle, .unavailable(.available), .unavailable(.unsupported):
      EmptyView()
    case .unavailable(.appleIntelligenceNotEnabled):
      contextSection {
        contextMessage("Turn on Apple Intelligence in Settings to see what this text is about.")
      }
    case .unavailable(.modelNotReady):
      contextSection {
        contextMessage("Context appears once Apple Intelligence finishes downloading.")
      }
    case .loading:
      contextSection {
        ProgressView("Reading the text…")
          .accessibilityIdentifier("image-text.context-loading")
      }
    case .loaded(let insights):
      contextSection {
        if !insights.context.isEmpty {
          Text(insights.context)
            .fixedSize(horizontal: false, vertical: true)
            .textSelection(.enabled)
            .accessibilityIdentifier("image-text.context")
        }
        ForEach(insights.notes) { note in
          VStack(alignment: .leading, spacing: 4) {
            Button(note.phrase) { open(note.entry, in: page, lineID: -1) }
              .font(.headline)
            Text(note.meaning)
              .font(.callout)
              .foregroundStyle(.secondary)
              .fixedSize(horizontal: false, vertical: true)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityElement(children: .combine)
          .accessibilityIdentifier("image-text.note.\(note.phrase)")
        }
        sectionFootnote(
          "Written on this device by Apple Intelligence. Idiom meanings are from Zenbu’s dictionary."
        )
      }
    case .failed:
      contextSection {
        contextMessage("Context couldn’t be written for this image.")
      }
    }
  }

  private func contextSection(@ViewBuilder content: () -> some View) -> some View {
    VStack(alignment: .leading, spacing: 16) {
      sectionHeader("Context")
      content()
    }
  }

  private func sectionHeader(_ title: LocalizedStringKey) -> some View {
    Text(title)
      .font(.caption.bold())
      .textCase(.uppercase)
      .foregroundStyle(.secondary)
  }

  private func sectionFootnote(_ message: LocalizedStringKey) -> some View {
    Text(message)
      .font(.caption)
      .foregroundStyle(.tertiary)
  }

  private func contextMessage(_ message: LocalizedStringKey) -> some View {
    Label(message, systemImage: "sparkles")
      .font(.footnote)
      .foregroundStyle(.secondary)
  }

  private func select(_ region: ImageTextRegion, in page: ImageTextPage) {
    model.selectedRegion = region
    activeLineID = region.lineID
    presentedWord = region.sheetRequest(asset: page.asset)
  }

  private func open(_ entry: DictionaryEntry, in page: ImageTextPage, lineID: Int) {
    activeLineID = lineID
    presentedWord = RecognizedWordSheetRequest(
      id: "\(page.asset.id).line.\(lineID).\(entry.id.rawValue)",
      surface: entry.headword,
      entry: entry,
      candidateEntries: [],
      encounterMedia: EncounterMediaAttachment(name: page.asset.name, data: page.asset.data)
    )
  }

  private func open(
    _ surface: String,
    candidates: [DictionaryEntry],
    in page: ImageTextPage,
    lineID: Int
  ) {
    activeLineID = lineID
    presentedWord = RecognizedWordSheetRequest(
      id: "\(page.asset.id).line.\(lineID).\(surface)",
      surface: surface,
      entry: nil,
      candidateEntries: candidates,
      encounterMedia: EncounterMediaAttachment(name: page.asset.name, data: page.asset.data)
    )
  }
}

/// How Image Search shows a recognized page.
enum ImageTextViewMode: String, CaseIterable, Identifiable {
  case photo
  case both
  case text
  case translate

  var id: Self { self }

  var title: LocalizedStringKey {
    switch self {
    case .photo: "Photo"
    case .both: "Both"
    case .text: "Text"
    case .translate: "Translate"
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

private struct ImageTextCanvas: View {
  let page: ImageTextPage
  let showsRegions: Bool
  let selectedRegion: ImageTextRegion?
  let outlinedLineID: Int?
  let selectRegion: (ImageTextRegion) -> Void

  var body: some View {
    GeometryReader { geometry in
      if let image = UIImage(data: page.asset.data) {
        let imageRect = aspectFitRect(imageSize: image.size, container: geometry.size)
        ZStack(alignment: .topLeading) {
          // Top-aligned so a wide photo stays above the half-height word sheet without moving.
          Image(uiImage: image)
            .resizable()
            .scaledToFit()
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .top)
            .accessibilityHidden(true)

          if showsRegions {
            ForEach(page.regions) { region in
              let rect = interactiveTokenRect(
                displayRect(region.boundingBox, in: imageRect),
                isVertical: region.isVertical
              )
              ImageTextRegionButton(
                region: region,
                isSelected: selectedRegion?.id == region.id,
                select: selectRegion
              )
              .frame(width: max(rect.width, 1), height: max(rect.height, 1))
              .position(x: rect.midX, y: rect.midY)
            }
          }

          if let line = page.lines.first(where: { $0.id == outlinedLineID }) {
            let rect = displayRect(line.boundingBox, in: imageRect).insetBy(dx: -3, dy: -3)
            RoundedRectangle(cornerRadius: 4)
              .fill(.tint.opacity(0.12))
              .strokeBorder(.tint, lineWidth: 2)
              .frame(width: rect.width, height: rect.height)
              .position(x: rect.midX, y: rect.midY)
              .allowsHitTesting(false)
              .accessibilityHidden(true)
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
        .animation(.easeInOut(duration: 0.2), value: outlinedLineID)
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
      y: 0,
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

  /// Vertical chips nearly touch, since alternating shades already mark word boundaries;
  /// horizontal underlines keep a gap between words.
  private func interactiveTokenRect(_ recognizedRect: CGRect, isVertical: Bool) -> CGRect {
    if isVertical {
      let gap = min(1.5, recognizedRect.height * 0.08)
      return recognizedRect.insetBy(dx: 0, dy: gap / 2)
    }
    let gap = min(5, recognizedRect.width * 0.16)
    return recognizedRect.insetBy(dx: gap / 2, dy: 0)
  }
}

/// A recognized word over the photo, in the accent color linked words use elsewhere. Words in
/// vertical lines are tinted chips that alternate shade along the column, because an underline
/// beside a column reads as a ruling line; horizontal words keep an underline.
private struct ImageTextRegionButton: View {
  let region: ImageTextRegion
  let isSelected: Bool
  let select: (ImageTextRegion) -> Void

  var body: some View {
    Button {
      select(region)
    } label: {
      Color.clear
        .contentShape(.rect)
        .background {
          RoundedRectangle(cornerRadius: 3)
            .fill(Color.accentColor.opacity(fillOpacity))
        }
        .overlay(alignment: .bottom) {
          if !region.isVertical { underline }
        }
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Recognized \(region.surface)")
    .accessibilityIdentifier("image-text.region.\(region.surface)")
  }

  private var fillOpacity: Double {
    if region.isVertical {
      return isSelected ? 0.45 : region.indexInLine.isMultiple(of: 2) ? 0.12 : 0.24
    }
    return isSelected ? 0.14 : 0.05
  }

  private var underline: some View {
    Rectangle()
      .fill(Color.accentColor.opacity(isSelected ? 1 : 0.78))
      .frame(height: 3)
  }
}

/// Both: the photo on top with the current line outlined, and each recognized line below as a
/// caption card, like the Player's captions.
private struct ImageTextLineCards: View {
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences
  let page: ImageTextPage
  let model: ImageTextFlowModel
  let textAnalysisClient: JapaneseTextAnalysisClient
  let highlightedEntry: DictionaryEntry?
  let isWordSheetPresented: Bool
  let selectedRegion: ImageTextRegion?
  @Binding var activeLineID: Int?
  let selectRegion: (ImageTextRegion) -> Void
  let openWord: (DictionaryEntry, Int) -> Void
  let openCandidates: (String, [DictionaryEntry], Int) -> Void
  /// A line to scroll the cards to. Only a word tapped on the image sets it, so a word tapped in
  /// a card never moves the list under the learner's finger.
  @State private var scrollTarget: Int?

  var body: some View {
    GeometryReader { geometry in
      VStack(spacing: 0) {
        ImageTextCanvas(
          page: page,
          showsRegions: model.showsHighlights,
          selectedRegion: selectedRegion,
          outlinedLineID: activeLineID,
          selectRegion: { region in
            scrollTarget = region.lineID
            selectRegion(region)
          }
        )
        .frame(height: geometry.size.height * 0.38)
        .padding(.bottom, 4)

        ScrollViewReader { proxy in
          List {
            ForEach(page.lines) { line in
              let isActive = line.id == activeLineID
              CaptionCard(
                text: line.text,
                translation: model.translation(of: line.text),
                highlightedEntry: isActive ? highlightedEntry : nil,
                japaneseTextAnalysisClient: textAnalysisClient,
                identifierPrefix: "image-text.line.\(line.id)",
                openCandidates: { surface, candidates in openCandidates(surface, candidates, line.id) },
                openWord: { entry in openWord(entry, line.id) }
              )
              // Tapping a line outside its words outlines it on the image.
              .contentShape(.rect)
              .onTapGesture { activeLineID = line.id }
              .accessibilityElement(children: .contain)
              .accessibilityIdentifier("image-text.line.\(line.id)")
              .captionCardRow(isActive: isActive)
              .id(line.id)
            }
          }
          .listStyle(.plain)
          .contentMargins(.top, 8, for: .scrollContent)
          // Room to scroll the last lines above the half-height word sheet.
          .contentMargins(
            .bottom, isWordSheetPresented ? geometry.size.height * 0.45 : 16, for: .scrollContent
          )
          .onChange(of: scrollTarget) { _, lineID in
            guard let lineID else { return }
            withAnimation { proxy.scrollTo(lineID, anchor: .top) }
            scrollTarget = nil
          }
          .accessibilityIdentifier("image-text.lines")
        }
      }
    }
    .onAppear {
      if activeLineID == nil { activeLineID = page.lines.first?.id }
    }
    .task(id: page.asset.id) { translateIfReady() }
  }

  /// Like the Player's captions, lines are translated without asking when translation is ready.
  private func translateIfReady() {
    guard readingAidPreferences.showsTranslations, case .idle = model.translationState else {
      return
    }
    model.requestTranslation(preparesIfNeeded: false)
  }
}

/// Text: the recognized Japanese as paragraph caption cards, one Dynamic Type step larger than
/// Both since this view is for reading.
private struct ImageTextReader: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences
  let page: ImageTextPage
  let model: ImageTextFlowModel
  let textAnalysisClient: JapaneseTextAnalysisClient
  let highlightedEntry: DictionaryEntry?
  let activeParagraphID: Int?
  let isWordSheetPresented: Bool
  let openWord: (DictionaryEntry, Int) -> Void
  let openCandidates: (String, [DictionaryEntry], Int) -> Void

  var body: some View {
    GeometryReader { geometry in
      List {
        ForEach(page.paragraphs) { paragraph in
          let isActive = isWordSheetPresented && paragraph.id == activeParagraphID
          CaptionCard(
            text: paragraph.text,
            translation: model.translation(of: paragraph.text),
            highlightedEntry: isActive ? highlightedEntry : nil,
            japaneseTextAnalysisClient: textAnalysisClient,
            identifierPrefix: "image-text.paragraph.\(paragraph.id)",
            openCandidates: { surface, candidates in
              openCandidates(surface, candidates, paragraph.id)
            },
            openWord: { entry in openWord(entry, paragraph.id) }
          )
          .captionCardRow(isActive: isActive)
        }
      }
      .listStyle(.plain)
      .dynamicTypeSize(dynamicTypeSize.oneStepLarger)
      .contentMargins(.top, 8, for: .scrollContent)
      .contentMargins(
        .bottom, isWordSheetPresented ? geometry.size.height * 0.45 : 16, for: .scrollContent
      )
      .accessibilityIdentifier("image-text.reader")
    }
    .task(id: page.asset.id) {
      if readingAidPreferences.showsTranslations, case .idle = model.translationState {
        model.requestTranslation(preparesIfNeeded: false)
      }
    }
  }
}

extension DynamicTypeSize {
  fileprivate var oneStepLarger: DynamicTypeSize {
    let sizes = DynamicTypeSize.allCases
    guard let index = sizes.firstIndex(of: self), index + 1 < sizes.count else { return self }
    return sizes[index + 1]
  }
}
