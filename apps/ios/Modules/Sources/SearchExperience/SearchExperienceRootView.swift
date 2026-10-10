import SwiftUI

struct SearchExperienceRootView: View {
  @State private var selectedTab = SearchExperienceTab.search
  @State private var searchFocusRequest = 0
  @State private var showsImageSources = false
  @State private var frequencyRefreshID = 0
  @State private var path: [SearchExperienceRoute] = []
  @State private var accountPath = NavigationPath()
  @State private var query = ""
  @State private var imageTextSessionStore = ImageTextSessionStore()
  @State private var wordSheets = DictionaryWordSheets()
  @State private var watchPath = NavigationPath()
  private let watchHistory = WatchHistory.shared
  @State private var translatePath = NavigationPath()
  @Environment(TranslateExperience.self) private var translateExperience
  @State private var kanjiScroll = KanjiScrollMemory()
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

  init() {
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

  var body: some View {
    appTabs
      .modifier(
        ImageTextImport(
          showsSources: $showsImageSources, cameraAuthorizationClient: cameraAuthorizationClient,
          openImageText: openImageText)
      )
      .modifier(
        WebsiteLinkOpening(
          lookupClient: lookupClient, searchPath: searchPath, query: $query,
          showSearch: {
            selectedTab = .search
            dismissRecognizedWordSheet(if: true)
          }))
      .modifier(AppCommandHandling(perform: perform))
  }

  private func perform(_ command: AppCommand) {
    switch command {
    case .select(let tab):
      selectedTab = tab
      dismissRecognizedWordSheet(if: true)
    case .findInDictionary:
      showSearchRoot()
      Task { searchFocusRequest += 1 }
    case .searchImage:
      showTranslate()
      translatePath = NavigationPath()
      Task { showsImageSources = true }
    }
  }

  private func showSearchRoot() {
    selectedTab = .search
    path = []
    dismissRecognizedWordSheet(if: true)
  }

  private func showTranslate() {
    selectedTab = .translate
    dismissRecognizedWordSheet(if: true)
  }

  private func openImageText(_ assets: [ImageTextAsset]) {
    let session = ImageTextSession(assets: assets)
    imageTextSessionStore.insert(session)
    showTranslate()
    translatePath.append(SearchExperienceRoute.image(session.id))
  }

  private var appTabs: some View {
    TabView(selection: $selectedTab) {
      Tab(value: SearchExperienceTab.search) {
        searchNavigation
      } label: {
        SearchExperienceTab.search.label
      }

      Tab(value: SearchExperienceTab.translate) {
        translateNavigation
      } label: {
        SearchExperienceTab.translate.label
      }

      Tab(value: SearchExperienceTab.watchAndListen) {
        watchNavigation
      } label: {
        SearchExperienceTab.watchAndListen.label
      }

      Tab(value: SearchExperienceTab.account) {
        accountNavigation
      } label: {
        SearchExperienceTab.account.label
          .accessibilityLabel("Account, personal content and settings")
          .accessibilityIdentifier("tab.account")
      }
    }
    .tabViewStyle(.sidebarAdaptable)
    .scrollEdgeEffectStyle(.hard, for: .bottom)
    .modifier(
      TranslateSessionChrome(
        experience: translateExperience,
        isTranslateSelected: selectedTab == .translate,
        isConversationOnScreen: isConversationOnScreen,
        returnToTranslate: {
          selectedTab = .translate
          translatePath = NavigationPath()
        }
      ))
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
        kanjiLookupClient: kanjiLookupClient,
        radicalLookupClient: .live,
        exampleSentenceClient: exampleSentenceClient,
        frequencyCapability: .live,
        frequencyRefreshID: frequencyRefreshID,
        focusRequest: searchFocusRequest
      )
      .modifier(dictionaryRoutes(in: .search))
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
        preservedWordID: kanjiScroll.wordIDs[character],
        preservedElementID: kanjiScroll.elementIDs[character],
        openList: openWordList
      )
    case .kanjiElement(let id):
      KanjiElementDetailView(
        elementID: id,
        lookupClient: kanjiElementLookupClient,
        preservedContribution: kanjiScroll.contributions[id]
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
          presentedWord: wordSheets[stack]?.requestBinding ?? .constant(nil),
          endSession: {
            wordSheets[stack]?.request = nil
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
            presentedWord: wordSheets.player.requestBinding
          )
        case .search(let search):
          VideoSearchView(search: search) { videoID in
            watchPath.append(PlayerRoute.video(videoID))
          }
        }
      }
      .modifier(dictionaryRoutes(in: .player))
    }
  }

  private var translateNavigation: some View {
    NavigationStack(path: $translatePath) {
      TranslateTabRoot(
        experience: translateExperience,
        words: translateWords(opening: wordSheets.translate),
        isConversationOnScreen: isConversationOnScreen,
        push: { translatePath.append($0) },
        showsImageSources: $showsImageSources
      )
      .modifier(dictionaryRoutes(in: .translate))
    }
    .onChange(of: translatePath.isEmpty) { _, isEmpty in
      if isEmpty { imageTextSessionStore.removeAll() }
    }
  }

  private var isConversationOnScreen: Bool {
    selectedTab == .translate && translatePath.isEmpty
  }

  private var accountNavigation: some View {
    NavigationStack(path: $accountPath) {
      AccountTabRoot(
        store: encounterMediaStore,
        translate: translateExperience,
        words: translateWords(opening: wordSheets.account),
        openItem: openSavedItem
      )
      .modifier(dictionaryRoutes(in: .account))
    }
  }

  private func translateWords(opening sheet: WordSheetPresentation) -> TranslateWordLinks {
    TranslateWordLinks(analysisClient: japaneseTextAnalysisClient, open: { sheet.request = $0 })
  }

  private func dictionaryRoutes(in stack: DictionaryStack)
    -> DictionaryRoutes<some View, some View>
  {
    DictionaryRoutes(
      sheet: wordSheets[stack],
      destination: { dictionaryDestination($0, in: stack) },
      wordSheet: { wordSheet(wordSheets[stack], in: stack) })
  }

  @ViewBuilder
  private func wordSheet(_ presentation: WordSheetPresentation?, in stack: DictionaryStack)
    -> some View
  {
    if let presentation, let request = presentation.displayedRequest {
      RecognizedWordSheet(
        request: request,
        detent: Bindable(presentation).detent,
        openFullEntry: { open(.word($0, nil), in: stack, leavingSheet: true) }
      ) { entry, encounterMedia in
        wordDetailView(
          entry: entry,
          initialEncounterMedia: encounterMedia,
          presentedInSheet: true,
          in: stack
        )
      }
    }
  }

  private func push(_ route: SearchExperienceRoute, in stack: DictionaryStack) {
    switch stack {
    case .search: searchPath.wrappedValue = path + [route]
    case .player: watchPath.append(route)
    case .translate: translatePath.append(route)
    case .account: accountPath.append(route)
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
      openKanji: { open(.kanji($0, $1), in: stack, leavingSheet: presentedInSheet) },
      openWord: { open(.word($0, nil), in: stack, leavingSheet: presentedInSheet) },
      openConjugations: { table in
        open(.conjugations(entry, table), in: stack, leavingSheet: presentedInSheet)
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

  private func open(
    _ route: SearchExperienceRoute, in stack: DictionaryStack, leavingSheet: Bool
  ) {
    dismissRecognizedWordSheet(if: leavingSheet)
    push(route, in: stack)
  }

  private func dismissRecognizedWordSheet(if shouldDismiss: Bool) {
    guard shouldDismiss else { return }
    for stack in DictionaryStack.allCases { wordSheets[stack]?.request = nil }
  }

  private var searchPath: Binding<[SearchExperienceRoute]> {
    Binding {
      path
    } set: { newPath in
      if newPath.count > path.count {
        kanjiScroll.remember(leaving: path.last, for: newPath.last)
      }
      path = newPath
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
    openInAccount(.wordList(listID), from: [.wordLists])
  }

  private func openFrequencyDictionaries() {
    openInAccount(.frequencyDictionaries, from: [])
  }

  private func openInAccount(_ route: AccountRoute, from parents: [AccountRoute]) {
    if selectedTab == .account {
      accountPath.append(route)
    } else {
      selectedTab = .account
      accountPath = NavigationPath(parents + [route])
    }
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
