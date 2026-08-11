import SwiftUI

public struct SearchReplicaRootView: View {
  @State private var path: [ReplicaRoute] = []
  @State private var query = ""
  @State private var presentedSheet: ReplicaSheet?
  @State private var unavailableTab: ReplicaUnavailableTab?
  @State private var exportsImageFixtures = false
  @State private var imageTextSessionStore = ImageTextSessionStore()
  @State private var kanjiScrollWordIDs: [KanjiCharacter: LanguageReferenceID] = [:]
  #if DEBUG
  @State private var lastStartedSpeech: SpeechPlaybackVerificationEvent?
  @State private var lastFinishedSpeech: SpeechPlaybackVerificationEvent?
  #endif
  private let lookupClient = LookupClient.live
  private let recentSearchStore = RecentSearchStore.live
  private let handwritingRecognitionClient: HandwritingRecognitionClient
  private let cameraAuthorizationClient: CameraAuthorizationClient
  private let speechSynthesisClient: SpeechSynthesisClient
  private let kanjiStrokeOrderClient: KanjiStrokeOrderClient
  private let kanjiElementLookupClient: KanjiElementLookupClient
  private let japaneseConjugationClient = JapaneseConjugationClient.live
  private let imageImportInitialDirectory: URL?
  private let imageTextRecognitionClient: ImageTextRecognitionClient
  private let naturalTranslationClient: NaturalTranslationClient
  private let imageFixtureExportURLs: [URL]

  public init() {
    #if DEBUG
    handwritingRecognitionClient = HandwritingRecognitionFixture.clientFromProcessArguments() ?? .live
    cameraAuthorizationClient = CameraAuthorizationClient.clientFromProcessArguments() ?? .live
    speechSynthesisClient = SpeechSynthesisClient.clientFromProcessArguments() ?? .live
    kanjiStrokeOrderClient = KanjiStrokeOrderClient.clientFromProcessArguments() ?? .live
    kanjiElementLookupClient = KanjiElementLookupClient.clientFromProcessArguments() ?? .live
    imageImportInitialDirectory = ImageTextTestFixtures.prepareIfRequested()
    imageTextRecognitionClient = ImageTextRecognitionFixture.clientFromProcessArguments(live: .live) ?? .live
    naturalTranslationClient = NaturalTranslationClient.clientFromProcessArguments() ?? .live
    imageFixtureExportURLs = ImageTextTestFixtures.exportURLsFromProcessArguments(in: imageImportInitialDirectory)
    _exportsImageFixtures = State(initialValue: !imageFixtureExportURLs.isEmpty)
    if let session = ImageTextTestFixtures.sessionFromProcessArguments(in: imageImportInitialDirectory) {
      _imageTextSessionStore = State(initialValue: ImageTextSessionStore(session: session))
      _path = State(initialValue: [.image(session.id)])
    }
    #else
    handwritingRecognitionClient = .live
    cameraAuthorizationClient = .live
    speechSynthesisClient = .live
    kanjiStrokeOrderClient = .live
    kanjiElementLookupClient = .live
    imageImportInitialDirectory = nil
    imageTextRecognitionClient = .live
    naturalTranslationClient = .live
    imageFixtureExportURLs = []
    #endif
  }

  public var body: some View {
    NavigationStack(path: $path) {
      SearchView(
        query: $query,
        lookupClient: lookupClient,
        recentSearchStore: recentSearchStore,
        handwritingRecognitionClient: handwritingRecognitionClient,
        cameraAuthorizationClient: cameraAuthorizationClient,
        radicalLookupClient: .live,
        exampleSentenceClient: .live,
        openResult: { entry in path.append(.word(entry, "Search", nil)) },
        openKanji: openKanji,
        openExamples: { query, entry in path.append(.examples(query, entry)) },
        openImageText: { assets in
          let session = ImageTextSession(assets: assets)
          imageTextSessionStore.insert(session)
          path.append(.image(session.id))
        },
        imageImportInitialDirectory: imageImportInitialDirectory
      )
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button {
            presentedSheet = .sources
          } label: {
            Image(systemName: "info.circle")
          }
          .accessibilityLabel("Dictionary Sources")
          .accessibilityIdentifier("search.sources")
        }
      }
      .navigationDestination(for: ReplicaRoute.self) { route in
        switch route {
        case .word(let entry, let backTitle, let imageContext):
          WordDetailView(
            entry: entry,
            backTitle: backTitle,
            imageAttachment: imageAttachment(for: imageContext),
            speechSynthesisClient: speechSynthesisClient,
            exampleSentenceClient: .live,
            japaneseTextAnalysisClient: .live(lookupClient: lookupClient),
            wordNoteStore: .live,
            conjugationTable: japaneseConjugationClient.table(entry),
            openRelated: openRelated,
            openKanji: openKanji,
            openWord: { entry in path.append(.word(entry, "Search", nil)) },
            openConjugations: { table in path.append(.conjugations(entry, table)) }
          )
        case .kanji(let character, let entry):
          KanjiDetailView(
            character: character,
            entry: entry,
            kanjiLookupClient: .live(lookupClient: lookupClient),
            kanjiElementLookupClient: kanjiElementLookupClient,
            kanjiStrokeOrderClient: kanjiStrokeOrderClient,
            openWord: { entry in path.append(.word(entry, "Search", nil)) },
            openElement: { id in path.append(.kanjiElement(id)) },
            preservedWordID: kanjiScrollWordIDs[character],
            preserveWordID: { kanjiScrollWordIDs[character] = $0 }
          )
        case .kanjiElement(let id):
          KanjiElementDetailView(
            elementID: id,
            lookupClient: kanjiElementLookupClient,
            openAlternative: { alternative in path.append(.kanjiElement(alternative)) },
            openKanji: { character in openKanji(character, entry: nil) }
          )
        case .examples(let query, let highlightedEntry):
          ExampleSentencesView(
            query: query,
            highlightedEntry: highlightedEntry,
            exampleSentenceClient: .live,
            japaneseTextAnalysisClient: .live(lookupClient: lookupClient),
            speechSynthesisClient: speechSynthesisClient,
            openWord: { entry in path.append(.word(entry, "Search", nil)) }
          )
        case .conjugations(let entry, let table):
          ConjugationsView(entry: entry, table: table)
        case .image(let sessionID):
          if let session = imageTextSessionStore.session(sessionID) {
            ImageTextFlowView(
            session: session,
            recognitionClient: imageTextRecognitionClient,
            textAnalysisClient: .live(lookupClient: lookupClient),
            translationClient: naturalTranslationClient,
            close: {
              if path.last == .image(sessionID) { path.removeLast() }
              imageTextSessionStore.remove(sessionID)
            },
            openWord: { entry, asset in
              path.append(.word(entry, "Photo", ImageWordContext(sessionID: sessionID, assetID: asset.id)))
            }
            )
          }
        }
      }
    }
    .tint(.white)
    .toolbarBackground(ReplicaPalette.chrome, for: .navigationBar)
    .toolbarBackground(.visible, for: .navigationBar)
    .toolbarColorScheme(.dark, for: .navigationBar)
    .safeAreaInset(edge: .bottom, spacing: 0) {
      ReplicaTabBar(select: selectTab)
    }
    .background(.black)
    .sheet(item: $presentedSheet) { sheet in
      switch sheet {
      case .sources:
        DictionarySourcesView()
      }
    }
    .alert(item: $unavailableTab) { unavailable in
      Alert(
        title: Text("\(unavailable.tab.rawValue) is outside this replica"),
        message: Text("This acceptance replica is limited to Search and dictionary journeys."),
        dismissButton: .default(Text("OK"))
      )
    }
    #if DEBUG
    .sheet(isPresented: $exportsImageFixtures) {
      ImageFileExporter(urls: imageFixtureExportURLs) {
        exportsImageFixtures = false
      }
      .ignoresSafeArea()
    }
    #endif
    .overlay(alignment: .topLeading) {
      #if DEBUG
      SpeechPlaybackVerificationOverlay(
        started: lastStartedSpeech,
        finished: lastFinishedSpeech
      )
      #endif
    }
    #if DEBUG
    .onReceive(NotificationCenter.default.publisher(for: SpeechPlaybackVerification.notification)) {
      notification in
      guard let event = notification.object as? SpeechPlaybackVerificationEvent else { return }
      switch event.phase {
      case .started:
        lastStartedSpeech = event
        lastFinishedSpeech = nil
      case .finished:
        lastFinishedSpeech = event
      }
    }
    #endif
  }

  private func openKanji(_ character: KanjiCharacter, entry: DictionaryEntry?) {
    kanjiScrollWordIDs[character] = nil
    path.append(.kanji(character, entry))
  }

  private func selectTab(_ tab: ReplicaTab) {
    if tab == .search {
      path.removeAll()
    } else {
      unavailableTab = ReplicaUnavailableTab(tab: tab)
    }
  }

  private func openRelated(_ relationship: DictionaryRelationship) {
    Task { @MainActor in
      if let targetID = relationship.targetID {
        if let entry = try? await lookupClient.entry(LanguageReferenceID(rawValue: targetID)) {
          path.append(.word(entry, "Search", nil))
        }
        return
      }
      guard let results = try? await lookupClient.search(SearchQuery(relationship.query)) else { return }
      let entry = (results.best + results.additional).first {
        $0.headword == relationship.headword && $0.reading == relationship.reading
      } ?? results.best.first ?? results.additional.first
      if let entry { path.append(.word(entry, "Search", nil)) }
    }
  }

  private func imageAttachment(for context: ImageWordContext?) -> ImageWordAttachment? {
    guard let context,
      let asset = imageTextSessionStore.session(context.sessionID)?.assets.first(where: { $0.id == context.assetID })
    else { return nil }
    return ImageWordAttachment(name: asset.name, data: asset.data)
  }
}

private struct ReplicaUnavailableTab: Identifiable {
  let tab: ReplicaTab
  var id: ReplicaTab { tab }
}

#if DEBUG
private struct SpeechPlaybackVerificationOverlay: View {
  let started: SpeechPlaybackVerificationEvent?
  let finished: SpeechPlaybackVerificationEvent?

  var body: some View {
    if SpeechPlaybackVerification.isEnabled {
      VStack(spacing: 0) {
        verificationElement(started, phaseLabel: "started", identifier: "speech.playback.started")
        verificationElement(finished, phaseLabel: "finished", identifier: "speech.playback.finished")
      }
    }
  }

  @ViewBuilder
  private func verificationElement(
    _ event: SpeechPlaybackVerificationEvent?,
    phaseLabel: String,
    identifier: String
  ) -> some View {
    if let event {
      Color.clear
        .frame(width: 1, height: 1)
        .accessibilityElement()
        .accessibilityLabel("Speech \(phaseLabel) \(event.text)")
        .accessibilityValue(
          "\(event.invocationID.uuidString)|\(event.voiceLanguage ?? "unresolved")"
        )
        .accessibilityIdentifier(identifier)
    }
  }
}
#endif

private struct ImageWordContext: Hashable {
  let sessionID: UUID
  let assetID: UUID
}

private enum ReplicaRoute: Hashable {
  case word(DictionaryEntry, String, ImageWordContext?)
  case kanji(KanjiCharacter, DictionaryEntry?)
  case kanjiElement(KanjiElementID)
  case examples(SearchQuery, DictionaryEntry?)
  case conjugations(DictionaryEntry, ConjugationTable)
  case image(UUID)
}

private enum ReplicaSheet: String, Identifiable {
  case sources

  var id: String { rawValue }
}

enum ReplicaPalette {
  static let chrome = Color(red: 0, green: 0.56, blue: 0.07)
  static let row = Color(red: 0.105, green: 0.105, blue: 0.115)
  static let searchField = Color(red: 0.12, green: 0.12, blue: 0.14)
  static let secondaryText = Color(red: 0.67, green: 0.66, blue: 0.76)
  static let divider = Color.white.opacity(0.09)
  static let selectedTab = Color(red: 0.05, green: 0.48, blue: 1)
}
