import SwiftUI
@preconcurrency import Translation

struct ImageTextFlowView: View {
  @State private var model: ImageTextFlowModel
  @State private var analysisAvailability = JapaneseTextAnalysisAvailability.full
  @AppStorage("image-text.view-mode") private var mode = ImageTextViewMode.both
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
    .inlineNavigationTitle()
    .navigationBarBackButtonHidden(true)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        Button(action: close) {
          Image(systemName: "xmark")
        }
        .accessibilityLabel("Close")
        .accessibilityIdentifier("image-text.close")
      }

      ToolbarItem(placement: .barTrailing) {
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
        let image = Image(imageData: payload.data)
      {
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
    PagedView(
      selection: selectedPage, showsIndex: model.pages.count > 1, interactiveIndex: true
    ) {
      ForEach(Array(model.pages.enumerated()), id: \.element.id) { index, page in
        pageContent(page)
          .tag(index)
          .accessibilityHidden(index != model.selectedPage)
      }
    }
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
                if let translation = model.translation(of: paragraph.text) {
                  Text(translation)
                    .accessibilityIdentifier("image-text.translation.\(paragraph.id)")
                } else {
                  Text("This paragraph couldn’t be translated.")
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("image-text.translation-missing.\(paragraph.id)")
                }
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
    .task(id: model.selectedPage) {
      guard model.isSelected(page) else { return }
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
        let notes = insights.notes(notRepeating: page.paragraphs)
        ForEach(notes) { note in
          VStack(alignment: .leading, spacing: 4) {
            Button(note.phrase) { open(note.entry, in: page, lineID: nil) }
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
          notes.isEmpty
            ? "Written on this device by Apple Intelligence."
            : "Written on this device by Apple Intelligence. Idiom meanings are from Zenbu’s dictionary."
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

  private func open(_ entry: DictionaryEntry, in page: ImageTextPage, lineID: Int?) {
    if let lineID { activeLineID = lineID }
    presentedWord = RecognizedWordSheetRequest(
      id: "\(page.asset.id).line.\(lineID.map(String.init) ?? "context").\(entry.id.rawValue)",
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
