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
  @State private var screenReturns = ScreenReturns()
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
  private let imageTextRecognitionClient: ImageTextRecognitionClient
  private let naturalTranslationClient: NaturalTranslationClient
  private let imageTextExplanationClient: ImageTextExplanationClient
  private let imageTextClipboardClient: ImageTextClipboardClient

  init() {
    lookupClient = .live
    let text =
      ProcessInfo.processInfo.environment["ZENBU_MORPHOLOGY_ENGINE"] == "sudachi"
      ? DictionaryTextData(morphology: .live) : DictionaryTextData.shared
    let linked = LinkedEntries(lookupClient: .live)
    exampleSentenceClient = ExampleSentenceClient(text: text, linked: linked)
    japaneseTextAnalysisClient = .live(text: text, linked: linked)
    kanjiLookupClient = .live(lookupClient: .live)
    handwritingRecognitionClient = .live
    cameraAuthorizationClient = .live
    speechSynthesisClient = .live
    kanjiStrokeOrderClient = .live
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
      .environment(screenReturns)
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
      chooseImageSource()
    }
  }

  private func chooseImageSource() {
    showsImageSources = false
    Task { showsImageSources = true }
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
    .tabShell()
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
        _ = JapaneseRuby(surface: "日本", reading: "にほん")
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
      .navigationDestination(for: SearchExperienceRoute.self) {
        dictionaryDestination($0, in: .search)
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
        lookupClient: kanjiLookupClient,
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
    case .conjugations(let entry, let conjugations):
      ConjugationsView(
        entry: entry, conjugations: conjugations, speechSynthesisClient: speechSynthesisClient)
    case .conjugatedForm(_, let form):
      ConjugatedFormView(
        form: form,
        exampleSentenceClient: exampleSentenceClient,
        speechSynthesisClient: speechSynthesisClient,
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
    NavigationStack(path: countingReturns($watchPath)) {
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
      .navigationDestination(for: SearchExperienceRoute.self) {
        dictionaryDestination($0, in: .player)
      }
    }
    .modifier(wordSheetHost(wordSheets.player, in: .player))
  }

  private var translateNavigation: some View {
    NavigationStack(path: countingReturns($translatePath)) {
      TranslateTabRoot(
        experience: translateExperience,
        words: translateWords(opening: wordSheets.translate),
        isConversationOnScreen: isConversationOnScreen,
        push: { translatePath.append($0) },
        chooseImage: chooseImageSource
      )
      .navigationDestination(for: SearchExperienceRoute.self) {
        dictionaryDestination($0, in: .translate)
      }
    }
    .modifier(wordSheetHost(wordSheets.translate, in: .translate))
    .onChange(of: translatePath.isEmpty) { _, isEmpty in
      if isEmpty { imageTextSessionStore.removeAll() }
    }
  }

  private var isConversationOnScreen: Bool {
    selectedTab == .translate && translatePath.isEmpty
  }

  private var accountNavigation: some View {
    NavigationStack(path: countingReturns($accountPath)) {
      AccountTabRoot(
        store: encounterMediaStore,
        translate: translateExperience,
        words: translateWords(opening: wordSheets.account),
        openItem: openSavedItem
      )
      .navigationDestination(for: SearchExperienceRoute.self) {
        dictionaryDestination($0, in: .account)
      }
    }
    .modifier(wordSheetHost(wordSheets.account, in: .account))
  }

  private func translateWords(opening sheet: WordSheetPresentation) -> TranslateWordLinks {
    TranslateWordLinks(analysisClient: japaneseTextAnalysisClient, open: { sheet.request = $0 })
  }

  private func wordSheetHost(_ presentation: WordSheetPresentation, in stack: DictionaryStack)
    -> WordSheetHost<some View>
  {
    WordSheetHost(sheet: presentation) { wordSheet(presentation, in: stack) }
  }

  @ViewBuilder
  private func wordSheet(_ presentation: WordSheetPresentation, in stack: DictionaryStack)
    -> some View
  {
    if let request = presentation.displayedRequest {
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
      openRelated: { relationship in
        dismissRecognizedWordSheet(if: presentedInSheet)
        openRelated(relationship, in: stack)
      },
      openKanji: { open(.kanji($0, $1), in: stack, leavingSheet: presentedInSheet) },
      openWord: { open(.word($0, nil), in: stack, leavingSheet: presentedInSheet) },
      openConjugations: { conjugations in
        open(.conjugations(entry, conjugations), in: stack, leavingSheet: presentedInSheet)
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
      screenReturns.stackChanged(from: path.count, to: newPath.count)
      path = newPath
    }
  }

  private func countingReturns(_ path: Binding<NavigationPath>) -> Binding<NavigationPath> {
    Binding {
      path.wrappedValue
    } set: { newPath in
      screenReturns.stackChanged(from: path.wrappedValue.count, to: newPath.count)
      path.wrappedValue = newPath
    }
  }

  private func openRelated(_ relationship: DictionaryRelationship, in stack: DictionaryStack) {
    Task { @MainActor in
      if let entry = try? await lookupClient.relatedWord(relationship) {
        push(.word(entry, nil), in: stack)
      }
    }
  }

  private func openSavedItem(_ storedID: String, headword: String, reading: String) {
    selectedTab = .search
    if let kanji = SavedItem.kanji(storedID: storedID) {
      path.append(.kanji(kanji, nil))
      return
    }
    Task { @MainActor in
      if let entry = try? await lookupClient.savedWord(storedID, headword, reading) {
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
