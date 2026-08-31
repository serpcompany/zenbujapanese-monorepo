import SwiftUI

public struct SearchExperienceRootView: View {
  @State private var selectedTab = SearchExperienceTab.search
  @State private var path: [SearchExperienceRoute] = []
  @State private var query = ""
  #if DEBUG
    @State private var exportsImageFixtures = false
  #endif
  @State private var imageTextSessionStore = ImageTextSessionStore()
  @State private var kanjiScrollWordIDs: [KanjiCharacter: LanguageReferenceID] = [:]
  @State private var kanjiScrollElementIDs: [KanjiCharacter: KanjiElementID] = [:]
  @State private var kanjiElementScrollContributionIDs: [KanjiElementID: KanjiCharacter] = [:]
  #if DEBUG
    @State private var lastStartedSpeech: SpeechPlaybackVerificationEvent?
    @State private var lastFinishedSpeech: SpeechPlaybackVerificationEvent?
  #endif
  private let lookupClient: LookupClient
  private let recentSearchStore = RecentSearchStore.live
  private let encounterMediaStore = EncounterMediaStore.live
  private let handwritingRecognitionClient: HandwritingRecognitionClient
  private let cameraAuthorizationClient: CameraAuthorizationClient
  private let speechSynthesisClient: SpeechSynthesisClient
  private let kanjiStrokeOrderClient: KanjiStrokeOrderClient
  private let kanjiElementLookupClient: KanjiElementLookupClient
  private let japaneseConjugationClient = JapaneseConjugationClient.live
  private let imageImportInitialDirectory: URL?
  private let imageTextRecognitionClient: ImageTextRecognitionClient
  private let naturalTranslationClient: NaturalTranslationClient
  #if DEBUG
    private let imageFixtureExportURLs: [URL]
  #endif

  public init() {
    #if DEBUG
      lookupClient = LookupClient.clientFromProcessArguments(live: .live) ?? .live
      handwritingRecognitionClient =
        HandwritingRecognitionFixture.clientFromProcessArguments() ?? .live
      cameraAuthorizationClient = CameraAuthorizationClient.clientFromProcessArguments() ?? .live
      speechSynthesisClient = SpeechSynthesisClient.clientFromProcessArguments() ?? .live
      kanjiStrokeOrderClient = KanjiStrokeOrderClient.clientFromProcessArguments() ?? .live
      kanjiElementLookupClient = KanjiElementLookupClient.clientFromProcessArguments() ?? .live
      imageImportInitialDirectory = ImageTextTestFixtures.prepareIfRequested()
      imageTextRecognitionClient =
        ImageTextRecognitionFixture.clientFromProcessArguments(live: .live) ?? .live
      naturalTranslationClient = NaturalTranslationClient.clientFromProcessArguments() ?? .live
      imageFixtureExportURLs = ImageTextTestFixtures.exportURLsFromProcessArguments(
        in: imageImportInitialDirectory)
      _exportsImageFixtures = State(initialValue: !imageFixtureExportURLs.isEmpty)
      if let session = ImageTextTestFixtures.sessionFromProcessArguments(
        in: imageImportInitialDirectory)
      {
        _imageTextSessionStore = State(initialValue: ImageTextSessionStore(session: session))
        _path = State(initialValue: [.image(session.id)])
      }
    #else
      lookupClient = .live
      handwritingRecognitionClient = .live
      cameraAuthorizationClient = .live
      speechSynthesisClient = .live
      kanjiStrokeOrderClient = .live
      kanjiElementLookupClient = .live
      imageImportInitialDirectory = nil
      imageTextRecognitionClient = .live
      naturalTranslationClient = .live
    #endif
  }

  public var body: some View {
    TabView(selection: $selectedTab) {
      Tab("Search", systemImage: "magnifyingglass", value: SearchExperienceTab.search) {
        searchNavigation
      }

      Tab("More", systemImage: "ellipsis", value: SearchExperienceTab.more) {
        NavigationStack {
          MoreView(store: encounterMediaStore)
        }
      }
    }
    .tint(ZenbuTheme.interactiveForeground)
    .foregroundStyle(ZenbuTheme.foreground)
    .background(ZenbuTheme.background)
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
      .onReceive(NotificationCenter.default.publisher(for: SpeechPlaybackVerification.notification))
      {
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

  private var searchNavigation: some View {
    NavigationStack(path: searchPath) {
      SearchView(
        query: $query,
        lookupClient: lookupClient,
        recentSearchStore: recentSearchStore,
        handwritingRecognitionClient: handwritingRecognitionClient,
        cameraAuthorizationClient: cameraAuthorizationClient,
        radicalLookupClient: .live,
        exampleSentenceClient: .live,
        openImageText: { assets in
          let session = ImageTextSession(assets: assets)
          imageTextSessionStore.insert(session)
          path.append(.image(session.id))
        },
        imageImportInitialDirectory: imageImportInitialDirectory
      )
      .navigationDestination(for: SearchExperienceRoute.self) { route in
        switch route {
        case .word(let entry, let imageContext):
          WordDetailView(
            entry: entry,
            initialImageAttachment: imageAttachment(for: imageContext),
            speechSynthesisClient: speechSynthesisClient,
            exampleSentenceClient: .live,
            japaneseTextAnalysisClient: .live(lookupClient: lookupClient),
            wordNoteStore: .live,
            encounterMediaStore: encounterMediaStore,
            conjugationTable: japaneseConjugationClient.table(entry),
            openRelated: openRelated,
            openKanji: openKanji,
            openWord: { entry in path.append(.word(entry, nil)) },
            openConjugations: { table in path.append(.conjugations(entry, table)) }
          )
        case .kanji(let character, let entry):
          KanjiDetailView(
            character: character,
            entry: entry,
            kanjiLookupClient: .live(lookupClient: lookupClient),
            kanjiElementLookupClient: kanjiElementLookupClient,
            kanjiStrokeOrderClient: kanjiStrokeOrderClient,
            openWord: { entry in path.append(.word(entry, nil)) },
            openElement: { id in path.append(.kanjiElement(id)) },
            preservedWordID: kanjiScrollWordIDs[character],
            preserveWordID: {
              kanjiScrollWordIDs[character] = $0
              kanjiScrollElementIDs[character] = nil
            },
            preservedElementID: kanjiScrollElementIDs[character],
            preserveElementID: {
              kanjiScrollElementIDs[character] = $0
              kanjiScrollWordIDs[character] = nil
            }
          )
        case .kanjiElement(let id):
          KanjiElementDetailView(
            elementID: id,
            lookupClient: kanjiElementLookupClient,
            openAlternative: { alternative in path.append(.kanjiElement(alternative)) },
            openKanji: { character in openKanji(character, entry: nil) },
            preservedContribution: kanjiElementScrollContributionIDs[id],
            preserveContribution: { kanjiElementScrollContributionIDs[id] = $0 }
          )
        case .examples(let query, let highlightedEntry, let usesEntryExamples):
          ExampleSentencesView(
            query: query,
            highlightedEntry: highlightedEntry,
            usesHighlightedEntryExamples: usesEntryExamples,
            exampleSentenceClient: .live,
            japaneseTextAnalysisClient: .live(lookupClient: lookupClient),
            speechSynthesisClient: speechSynthesisClient,
            openWord: { entry in path.append(.word(entry, nil)) }
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
                path.append(
                  .word(entry, ImageWordContext(sessionID: sessionID, assetID: asset.id)))
              }
            )
          }
        }
      }
    }
    .foregroundStyle(ZenbuTheme.foreground)
    .background(ZenbuTheme.background)
  }

  private var searchPath: Binding<[SearchExperienceRoute]> {
    Binding {
      path
    } set: { newPath in
      if newPath.count > path.count,
        case .kanji(let character, _) = newPath.last
      {
        kanjiScrollWordIDs[character] = nil
      }
      path = newPath
    }
  }

  private func openKanji(_ character: KanjiCharacter, entry: DictionaryEntry?) {
    searchPath.wrappedValue = path + [.kanji(character, entry)]
  }

  private func openRelated(_ relationship: DictionaryRelationship) {
    Task { @MainActor in
      if let targetID = relationship.targetID {
        if let entry = try? await lookupClient.entry(LanguageReferenceID(rawValue: targetID)) {
          path.append(.word(entry, nil))
        }
        return
      }
      guard let results = try? await lookupClient.search(SearchQuery(relationship.query)) else {
        return
      }
      let entry =
        (results.best + results.additional).first {
          $0.headword == relationship.headword && $0.reading == relationship.reading
        } ?? results.best.first ?? results.additional.first
      if let entry { path.append(.word(entry, nil)) }
    }
  }

  private func imageAttachment(for context: ImageWordContext?) -> WordImageAttachment? {
    guard let context,
      let asset = imageTextSessionStore.session(context.sessionID)?.assets.first(where: {
        $0.id == context.assetID
      })
    else { return nil }
    return WordImageAttachment(name: asset.name, data: asset.data)
  }
}

#if DEBUG
  private struct SpeechPlaybackVerificationOverlay: View {
    let started: SpeechPlaybackVerificationEvent?
    let finished: SpeechPlaybackVerificationEvent?

    var body: some View {
      if SpeechPlaybackVerification.isEnabled {
        VStack(spacing: 0) {
          verificationElement(started, phaseLabel: "started", identifier: "speech.playback.started")
          verificationElement(
            finished, phaseLabel: "finished", identifier: "speech.playback.finished")
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

struct ImageWordContext: Hashable {
  let sessionID: UUID
  let assetID: UUID
}

enum SearchExperienceRoute: Hashable {
  case word(DictionaryEntry, ImageWordContext?)
  case kanji(KanjiCharacter, DictionaryEntry?)
  case kanjiElement(KanjiElementID)
  case examples(SearchQuery, DictionaryEntry?, Bool)
  case conjugations(DictionaryEntry, ConjugationTable)
  case image(UUID)
}

private enum SearchExperienceTab: Hashable {
  case search
  case more
}
