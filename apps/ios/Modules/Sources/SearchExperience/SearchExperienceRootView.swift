import SwiftUI

public struct SearchExperienceRootView: View {
  @State private var readingAidPreferences = ReadingAidPreferences()
  @State private var userProfile = UserProfile()
  private let wordKnowledge = WordKnowledge.shared
  private let wordLists = WordLists.shared
  private let zenbuAccount = ZenbuAccount.shared
  @Environment(\.scenePhase) private var scenePhase
  @State private var selectedTab = SearchExperienceTab.search
  @State private var frequencyRefreshID = 0
  @State private var path: [SearchExperienceRoute] = []
  @State private var accountPath: [AccountRoute] = []
  @State private var query = ""
  @State private var imageTextSessionStore = ImageTextSessionStore()
  @State private var imageWordSheet = WordSheetPresentation()
  @State private var watchPath = NavigationPath()
  @State private var watchWordSheet = WordSheetPresentation()
  @State private var watchHistory = WatchHistory()
  @State private var kanjiScrollWordIDs: [KanjiCharacter: LanguageReferenceID] = [:]
  @State private var kanjiScrollElementIDs: [KanjiCharacter: KanjiElementID] = [:]
  @State private var kanjiElementScrollContributionIDs: [KanjiElementID: KanjiCharacter] = [:]
  private let lookupClient: LookupClient
  private let exampleSentenceClient: ExampleSentenceClient
  private let japaneseTextAnalysisClient: JapaneseTextAnalysisClient
  private let recentSearchStore = RecentSearchStore.live
  private let encounterMediaStore = EncounterMediaStore.live
  private let handwritingRecognitionClient: HandwritingRecognitionClient
  private let cameraAuthorizationClient: CameraAuthorizationClient
  private let speechSynthesisClient: SpeechSynthesisClient
  private let kanjiLookupClient: KanjiLookupClient
  private let kanjiStrokeOrderClient: KanjiStrokeOrderClient
  private let kanjiElementLookupClient: KanjiElementLookupClient
  private let japaneseConjugationClient = JapaneseConjugationClient.live
  private let imageTextRecognitionClient: ImageTextRecognitionClient
  private let naturalTranslationClient: NaturalTranslationClient
  private let imageTextExplanationClient: ImageTextExplanationClient
  private let imageTextClipboardClient: ImageTextClipboardClient

  public init() {
    lookupClient = .live
    exampleSentenceClient = .live
    let morphologyClient: JapaneseMorphologyClient =
      ProcessInfo.processInfo.environment["ZENBU_MORPHOLOGY_ENGINE"] == "sudachi"
      ? .live : .kuromoji
    japaneseTextAnalysisClient = .resolving(
      morphologyClient: morphologyClient,
      lookupClient: .live
    )
    kanjiLookupClient = .live(lookupClient: .live)
    handwritingRecognitionClient = .live
    cameraAuthorizationClient = .live
    speechSynthesisClient = .live
    kanjiStrokeOrderClient = .live
    kanjiElementLookupClient = .live
    imageTextRecognitionClient = .live
    naturalTranslationClient = .live
    imageTextExplanationClient = .live(lookupClient: lookupClient)
    imageTextClipboardClient = .live
  }

  public var body: some View {
    appTabs
      .environment(readingAidPreferences)
      .environment(userProfile)
      .environment(wordKnowledge)
      .environment(wordLists)
      .environment(zenbuAccount)
      .onChange(of: scenePhase, initial: true) { _, phase in
        switch phase {
        case .active:
          wordKnowledge.saveIfNeeded()
          wordLists.saveIfNeeded()
          zenbuAccount?.scheduler.appBecameActive()
        case .background:
          zenbuAccount?.scheduler.appEnteredBackground()
        default:
          break
        }
      }
  }

  private var appTabs: some View {
    TabView(selection: $selectedTab) {
      Tab("Search", systemImage: "magnifyingglass", value: SearchExperienceTab.search) {
        searchNavigation
      }

      Tab(
        "Player", systemImage: "play.rectangle",
        value: SearchExperienceTab.watchAndListen
      ) {
        watchNavigation
      }

      Tab(value: SearchExperienceTab.account) {
        AccountNavigationView(
          path: $accountPath,
          store: encounterMediaStore,
          openItem: openSavedItem
        )
      } label: {
        Label("Account", systemImage: "person.crop.circle")
          .accessibilityLabel("Account, personal content and settings")
          .accessibilityIdentifier("tab.account")
      }
    }
    .scrollEdgeEffectStyle(.hard, for: .bottom)
    .task {
      await Task.detached(priority: .utility) {
        KanjiReadingSplitter.prepare()
        _ = try? await FrequencyPackClient.live.snapshot()
      }.value
    }
    .onChange(of: selectedTab) { previous, current in
      if previous != .search, current == .search {
        frequencyRefreshID += 1
      }
    }
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
        exampleSentenceClient: exampleSentenceClient,
        frequencyCapability: .live,
        frequencyRefreshID: frequencyRefreshID,
        openImageText: { assets in
          let session = ImageTextSession(assets: assets)
          imageTextSessionStore.insert(session)
          path.append(.image(session.id))
        }
      )
      .navigationDestination(for: SearchExperienceRoute.self) { route in
        dictionaryDestination(route, in: .search)
      }
      .sheet(isPresented: imageWordSheet.isPresentedBinding) {
        if let request = imageWordSheet.displayedRequest {
          RecognizedWordSheet(
            request: request,
            detent: $imageWordSheet.detent,
            openFullEntry: { entry in openFullEntry(entry, in: .search) }
          ) { entry, encounterMedia in
            wordDetailView(
              entry: entry,
              initialEncounterMedia: encounterMedia,
              presentedInSheet: true,
              in: .search
            )
          }
        }
      }
    }
  }

  @ViewBuilder
  private func dictionaryDestination(
    _ route: SearchExperienceRoute,
    in stack: DictionaryStack
  ) -> some View {
    switch route {
    case .word(let entry, let imageContext):
      wordDetailView(
        entry: entry,
        initialEncounterMedia: encounterMediaAttachment(for: imageContext),
        presentedInSheet: false,
        in: stack
      )
    case .kanji(let character, let entry):
      KanjiDetailView(
        character: character,
        entry: entry,
        kanjiLookupClient: kanjiLookupClient,
        kanjiElementLookupClient: kanjiElementLookupClient,
        kanjiStrokeOrderClient: kanjiStrokeOrderClient,
        wordNoteStore: .live,
        encounterMediaStore: encounterMediaStore,
        cameraAuthorizationClient: cameraAuthorizationClient,
        preservedWordID: kanjiScrollWordIDs[character],
        preservedElementID: kanjiScrollElementIDs[character],
        openList: openWordList
      )
    case .kanjiElement(let id):
      KanjiElementDetailView(
        elementID: id,
        lookupClient: kanjiElementLookupClient,
        preservedContribution: kanjiElementScrollContributionIDs[id]
      )
    case .examples(let query, let highlightedEntry, let usesEntryExamples):
      ExampleSentencesView(
        query: query,
        highlightedEntry: highlightedEntry,
        usesHighlightedEntryExamples: usesEntryExamples,
        exampleSentenceClient: exampleSentenceClient,
        japaneseTextAnalysisClient: japaneseTextAnalysisClient,
        speechSynthesisClient: speechSynthesisClient,
        openWord: { entry in push(.word(entry, nil), in: stack) }
      )
    case .conjugations(let entry, let table):
      ConjugationsView(
        entry: entry, table: table, speechSynthesisClient: speechSynthesisClient)
    case .conjugatedForm(let entry, let table, let form, let mode):
      ConjugatedFormView(
        entry: entry,
        table: table,
        form: form,
        mode: mode,
        exampleSentenceClient: exampleSentenceClient,
        speechSynthesisClient: speechSynthesisClient,
        japaneseTextAnalysisClient: japaneseTextAnalysisClient,
        openWord: { entry in push(.word(entry, nil), in: stack) }
      )
    case .image(let sessionID):
      if let session = imageTextSessionStore.session(sessionID) {
        ImageTextFlowView(
          session: session,
          recognitionClient: imageTextRecognitionClient,
          textAnalysisClient: japaneseTextAnalysisClient,
          translationClient: naturalTranslationClient,
          explanationClient: imageTextExplanationClient,
          clipboardClient: imageTextClipboardClient,
          presentedWord: imageWordSheet.requestBinding,
          close: {
            if path.last == .image(sessionID) { path.removeLast() }
            imageTextSessionStore.remove(sessionID)
          }
        )
      }
    }
  }

  private var watchNavigation: some View {
    NavigationStack(path: $watchPath) {
      WatchAndListenView(
        history: watchHistory,
        searchProvider: .youTube,
        openVideo: { videoID in watchPath.append(PlayerRoute.video(videoID)) },
        search: { search in watchPath.append(PlayerRoute.search(search)) }
      )
      .navigationDestination(for: PlayerRoute.self) { route in
        switch route {
        case .video(let videoID):
          WatchSessionView(
            videoID: videoID,
            history: watchHistory,
            captionClient: .live,
            japaneseTextAnalysisClient: japaneseTextAnalysisClient,
            presentedWord: watchWordSheet.requestBinding
          )
        case .search(let search):
          VideoSearchView(search: search) { videoID in
            watchPath.append(PlayerRoute.video(videoID))
          }
        }
      }
      .navigationDestination(for: SearchExperienceRoute.self) { route in
        dictionaryDestination(route, in: .player)
      }
      .sheet(isPresented: watchWordSheet.isPresentedBinding) {
        if let request = watchWordSheet.displayedRequest {
          RecognizedWordSheet(
            request: request,
            detent: $watchWordSheet.detent,
            openFullEntry: { entry in openFullEntry(entry, in: .player) }
          ) { entry, encounterMedia in
            wordDetailView(
              entry: entry,
              initialEncounterMedia: encounterMedia,
              presentedInSheet: true,
              in: .player
            )
          }
        }
      }
    }
  }

  private func openFullEntry(_ entry: DictionaryEntry, in stack: DictionaryStack) {
    dismissRecognizedWordSheet(if: true)
    push(.word(entry, nil), in: stack)
  }

  private func push(_ route: SearchExperienceRoute, in stack: DictionaryStack) {
    switch stack {
    case .search: searchPath.wrappedValue = path + [route]
    case .player: watchPath.append(route)
    }
  }

  private func wordDetailView(
    entry: DictionaryEntry,
    initialEncounterMedia: EncounterMediaAttachment?,
    presentedInSheet: Bool,
    in stack: DictionaryStack
  ) -> some View {
    WordDetailView(
      entry: entry,
      initialEncounterMedia: initialEncounterMedia,
      speechSynthesisClient: speechSynthesisClient,
      exampleSentenceClient: exampleSentenceClient,
      japaneseTextAnalysisClient: japaneseTextAnalysisClient,
      wordNoteStore: .live,
      encounterMediaStore: encounterMediaStore,
      cameraAuthorizationClient: cameraAuthorizationClient,
      frequencyCapability: .live,
      conjugationTable: japaneseConjugationClient.table(entry),
      openRelated: { relationship in
        dismissRecognizedWordSheet(if: presentedInSheet)
        openRelated(relationship, in: stack)
      },
      openKanji: { character, entry in
        dismissRecognizedWordSheet(if: presentedInSheet)
        push(.kanji(character, entry), in: stack)
      },
      openWord: { entry in
        dismissRecognizedWordSheet(if: presentedInSheet)
        push(.word(entry, nil), in: stack)
      },
      manageFrequencyDictionaries: {
        dismissRecognizedWordSheet(if: presentedInSheet)
        openFrequencyDictionaries()
      },
      openList: { listID in
        dismissRecognizedWordSheet(if: presentedInSheet)
        openWordList(listID)
      }
    )
  }

  private func dismissRecognizedWordSheet(if shouldDismiss: Bool) {
    guard shouldDismiss else { return }
    imageWordSheet.request = nil
    watchWordSheet.request = nil
  }

  private var searchPath: Binding<[SearchExperienceRoute]> {
    Binding {
      path
    } set: { newPath in
      if newPath.count > path.count {
        preserveKanjiContext(from: path.last, to: newPath.last)
        if case .kanji(let character, _) = newPath.last {
          kanjiScrollWordIDs[character] = nil
        }
      }
      path = newPath
    }
  }

  private func preserveKanjiContext(
    from origin: SearchExperienceRoute?,
    to destination: SearchExperienceRoute?
  ) {
    switch (origin, destination) {
    case (.kanji(let character, _), .word(let entry, _)):
      kanjiScrollWordIDs[character] = entry.id
      kanjiScrollElementIDs[character] = nil
    case (.kanji(let character, _), .kanjiElement(let elementID)):
      kanjiScrollElementIDs[character] = elementID
      kanjiScrollWordIDs[character] = nil
    case (.kanjiElement(let elementID), .kanji(let character, _)):
      kanjiElementScrollContributionIDs[elementID] = character
    default:
      break
    }
  }

  private func openRelated(_ relationship: DictionaryRelationship, in stack: DictionaryStack) {
    Task { @MainActor in
      if let targetID = relationship.targetID {
        if let entry = try? await lookupClient.entry(LanguageReferenceID(rawValue: targetID)) {
          push(.word(entry, nil), in: stack)
        }
        return
      }
      guard let results = try? await lookupClient.search(SearchQuery(relationship.query)) else {
        return
      }
      let entry =
        results.entries.first {
          $0.headword == relationship.headword && $0.reading == relationship.reading
        } ?? results.entries.first
      if let entry { push(.word(entry, nil), in: stack) }
    }
  }

  private func openSavedItem(_ storedID: String, headword: String, reading: String) {
    selectedTab = .search
    if let kanji = SavedItem.kanji(storedID: storedID) {
      path.append(.kanji(kanji, nil))
      return
    }
    Task { @MainActor in
      if let entry = try? await lookupClient.entry(LanguageReferenceID(rawValue: storedID)) {
        path.append(.word(entry, nil))
      } else if let entry = try? await lookupClient.search(SearchQuery(headword)).entries.first(
        where: { $0.headword == headword && $0.reading == reading })
      {
        path.append(.word(entry, nil))
      } else {
        path = []
        query = headword
      }
    }
  }

  private func openWordList(_ listID: UUID) {
    selectedTab = .account
    accountPath = [.wordLists, .wordList(listID)]
  }

  private func openFrequencyDictionaries() {
    selectedTab = .account
    accountPath = [.frequencyDictionaries]
  }

  private func encounterMediaAttachment(for context: ImageWordContext?)
    -> EncounterMediaAttachment?
  {
    guard let context,
      let asset = imageTextSessionStore.session(context.sessionID)?.assets.first(where: {
        $0.id == context.assetID
      })
    else { return nil }
    return EncounterMediaAttachment(name: asset.name, data: asset.data)
  }
}

struct ImageWordContext: Hashable {
  let sessionID: UUID
  let assetID: UUID
}

enum DictionaryStack {
  case search
  case player
}

enum PlayerRoute: Hashable {
  case video(YouTubeVideoID)
  case search(VideoSearch)
}

enum SearchExperienceRoute: Hashable {
  case word(DictionaryEntry, ImageWordContext?)
  case kanji(KanjiCharacter, DictionaryEntry?)
  case kanjiElement(KanjiElementID)
  case examples(SearchQuery, DictionaryEntry?, Bool)
  case conjugations(DictionaryEntry, ConjugationTable)
  case conjugatedForm(DictionaryEntry, ConjugationTable, ConjugatedForm, ConjugationMode)
  case image(UUID)
}

private enum SearchExperienceTab: Hashable {
  case search
  case watchAndListen
  case account
}
