import SwiftUI
import TranslatorCore
@preconcurrency import Translation

struct AccountTabRoot: View {
  let store: EncounterMediaStore
  let translate: TranslateExperience
  let words: TranslateWordLinks
  let lookupClient: LookupClient
  let openItem: (String, String, String) -> Void

  var body: some View {
    AccountRootView(translationHistory: translate.history)
      .navigationDestination(for: AccountRoute.self) { route in
        switch route {
        case .profile:
          ProfileView()
        case .zenbuAccount:
          ZenbuAccountView()
        case .readingAids:
          ReadingAidSettingsView()
        case .mediaLibrary:
          MediaLibraryView(store: store)
        case .notesWithoutAWord:
          NotesWithoutAWordView()
        case .marked(let status):
          MarkedWordsView(words: .of(status), lookupClient: lookupClient) {
            openItem($0.entryID, $0.headword, $0.reading)
          }
        case .wordLists:
          WordListsView()
        case .dailyLists:
          DailyListsView()
        case .wordList(let listID):
          WordListView(openedListID: listID) { openItem($0.entryID, $0.headword, $0.reading) }
        case .frequencyDictionaries:
          FrequencyDictionariesView(client: .live)
        case .credits:
          CreditsView()
        case .progress:
          ProgressScreen()
        case .jlptProgress:
          JLPTProgressScreen(lookupClient: lookupClient) {
            openItem($0.id.rawValue, $0.headword, $0.reading)
          }
        case .knownByDate:
          KnownByDateView(lookupClient: lookupClient) { openItem($0.entryID, $0.headword, $0.reading) }
        }
      }
      .modifier(TranslateDestinations(experience: translate, words: words))
  }
}

struct AccountRootView: View {
  @Environment(WordKnowledge.self) var wordKnowledge
  @Environment(WordLists.self) var wordLists
  @Environment(ZenbuAccount.self) private var zenbuAccount: ZenbuAccount?
  @Environment(NotesWithoutAWord.self) var notesWithoutAWord
  let translationHistory: ConversationHistory
  @State private var reportsProblem = false

  var body: some View {
    List {
      if LaunchHarness.shows("profile", on: "account") {
        Section {
          NavigationLink(value: AccountRoute.profile) {
            ProfileCardRow()
          }
          .accessibilityIdentifier("account.profile")
          if zenbuAccount != nil {
            ZenbuAccountRow()
          }
        }
      }

      if LaunchHarness.shows("progress", on: "account") {
        AccountProgressSection()
      }

      if ["library", "collections", "settings"].allSatisfy({ LaunchHarness.shows($0, on: "account") }) {
        Section {
          libraryRows
          collectionRows
        }

        Section { settingsRows }
      } else if LaunchHarness.shows("library", on: "account") {
        Section { libraryRows }
      } else if LaunchHarness.shows("collections", on: "account") {
        Section { collectionRows }
      } else if LaunchHarness.shows("settings", on: "account") {
        Section { settingsRows }
      }

      if LaunchHarness.shows("about", on: "account") {
        Section {
          AccountAboutHeader()
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 24, leading: 4, bottom: 8, trailing: 4))
        }

        Section {
          AccountExternalLink(destination: ZenbuLinks.support) {
            SettingsRowLabel("Help & Support", systemImage: "questionmark.bubble.fill", tint: .red)
          }
          .accessibilityIdentifier("account.support")

          ReportAProblemButton(reportsProblem: $reportsProblem)

          CrashReportsToggle()
        } footer: {
          Text(CrashReportsSection.note)
        }

        Section {
          AccountExternalLink(destination: ZenbuLinks.privacyPolicy) {
            SettingsRowLabel("Privacy Policy", systemImage: "hand.raised.fill", tint: .blue)
          }
          .accessibilityIdentifier("account.privacy-policy")

          NavigationLink(value: AccountRoute.credits) {
            SettingsRowLabel("Credits & Attributions", systemImage: "text.book.closed.fill", tint: .gray)
          }
          .accessibilityIdentifier("account.credits")
        }
      }
    }
    .compactSectionSpacing()
    .accessibilityIdentifier("account.list")
    .modifier(ProblemReportSheet(isPresented: $reportsProblem))
    .navigationTitle("Account")
    .inlineNavigationTitle()
  }
}

private struct AccountExternalLink<Label: View>: View {
  let destination: URL
  @ViewBuilder let label: Label

  var body: some View {
    Link(destination: destination) {
      HStack {
        label
        Spacer()
        Image(systemName: "arrow.up.right")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(.tertiary)
          .accessibilityHidden(true)
      }
    }
    .foregroundStyle(.primary)
  }
}

private struct AccountAboutHeader: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      StackedWhenLarge(spacing: 12, across: 12) {
        if let icon = AppIcon.image {
          icon
            .resizable()
            .frame(width: 56, height: 56)
            .clipShape(.rect(cornerRadius: 13))
            .accessibilityHidden(true)
        }
        VStack(alignment: .leading, spacing: 2) {
          Text(AppBundleInfo.name)
            .font(.title3.bold())
          if let version = AppBundleInfo.version {
            Text("Version \(version)")
              .foregroundStyle(.secondary)
          }
        }
      }
      Text(
        "Look up Japanese words, kanji, readings, meanings, conjugations, and example sentences in one focused dictionary."
      )
      .foregroundStyle(.secondary)
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("account.about")
  }
}

private enum AppBundleInfo {
  static var name: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String
      ?? Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String
      ?? "Zenbu Japanese"
  }

  static var version: String? {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
  }
}

extension EnvironmentValues {
  @Entry var openAccountRoute: (AccountRoute) -> Void = { _ in }
}

enum AccountRoute: Hashable {
  case profile
  case zenbuAccount
  case readingAids
  case mediaLibrary
  case notesWithoutAWord
  case marked(WordKnowledgeStatus)
  case wordLists
  case dailyLists
  case wordList(UUID)
  case frequencyDictionaries
  case credits
  case progress
  case jlptProgress
  case knownByDate
}

struct ReadingAidSettingsView: View {
  @Environment(ReadingAidPreferences.self) private var preferences
  @State private var appleTranslation: NaturalTranslationAvailability?
  @State private var downloadRequest: TranslationSession.Configuration?

  var body: some View {
    @Bindable var preferences = preferences
    Form {
      Section {
        Toggle("Show Furigana", isOn: $preferences.showsFurigana)
          .accessibilityIdentifier("reading-aids.show-furigana")
        Toggle("Show Romaji", isOn: $preferences.showsRomaji)
          .accessibilityIdentifier("reading-aids.show-romaji")
        Toggle("Hide Furigana on Known Words", isOn: $preferences.hidesFuriganaOnKnownWords)
          .disabled(!preferences.showsFurigana)
          .accessibilityIdentifier("reading-aids.hide-known-furigana")
      } header: {
        Text("Reading Aids")
      } footer: {
        Text(
          "Furigana appears above kanji. Romaji uses Apple’s system romanization and appears below complete Japanese text."
        )
      }
      Section {
        Toggle("Show Word Meanings", isOn: $preferences.showsWordMeanings)
          .accessibilityIdentifier("reading-aids.show-word-meanings")
        Toggle("Show Kanji Meanings", isOn: $preferences.showsKanjiMeanings)
          .accessibilityIdentifier("reading-aids.show-kanji-meanings")
        Toggle("Show Sentence Translations", isOn: $preferences.showsTranslations)
          .accessibilityIdentifier("reading-aids.show-translations")
        Picker("Translation Language", selection: $preferences.translationLanguage) {
          ForEach(TranslationLanguage.allCases) { language in
            Text(language.name).tag(language)
          }
        }
        .disabled(!preferences.showsTranslations)
        .accessibilityIdentifier("reading-aids.translation-language")
        Picker("Translate Player Captions With", selection: $preferences.translationSource) {
          ForEach(TranslationSource.allCases) { source in
            Text(source.name).tag(source)
          }
        }
        .disabled(!preferences.showsTranslations)
        .accessibilityIdentifier("reading-aids.translation-source")
        appleTranslationRow
      } header: {
        Text("Meanings and Translations")
      } footer: {
        Text(
          "Word meanings show a short meaning under each linked word you haven’t marked known. Kanji meanings show a short meaning under each kanji in Look Up’s Grade panel. Sentence translations show a natural translation under Player captions and example sentences. YouTube translates the whole video but can split lines differently; Apple translates each line on your device once its Japanese language is downloaded, and also fills lines YouTube leaves out."
        )
      }
    }
    .task { appleTranslation = try? await NaturalTranslationClient.live.availability() }
    .translationTask(downloadRequest) { session in
      try? await session.prepareTranslation()
      appleTranslation = try? await NaturalTranslationClient.live.availability()
      downloadRequest = nil
    }
    .formStyle(.grouped)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("reading-aids.form")
    .navigationTitle("Reading Aids")
    .inlineNavigationTitle()
  }
}

extension ReadingAidSettingsView {
  @ViewBuilder
  fileprivate var appleTranslationRow: some View {
    switch appleTranslation {
    case .installed:
      LabeledContent("Apple Translation", value: "Japanese Downloaded")
    case .downloadable:
      Button("Download Japanese for Apple Translation", systemImage: "arrow.down.circle") {
        downloadRequest = TranslationSession.Configuration(
          source: Locale.Language(identifier: "ja"),
          target: Locale.Language(identifier: preferences.translationLanguage.rawValue)
        )
      }
      .accessibilityIdentifier("reading-aids.download-apple-translation")
    case .unsupported:
      LabeledContent("Apple Translation", value: "Unavailable")
    case nil:
      EmptyView()
    }
  }
}

struct MediaLibraryView: View {
  @Environment(ZenbuAccount.self) private var zenbuAccount: ZenbuAccount?
  @State private var items: [EncounterMediaSummary] = []
  let store: EncounterMediaStore

  private var photosComing: String? { zenbuAccount?.photosComing }
  private var photosWaitForSubscription: Bool { zenbuAccount?.syncNeedsSubscription == true }

  var body: some View {
    Group {
      if items.isEmpty, let photosComing {
        ContentUnavailableView(
          photosWaitForSubscription ? "Photos Waiting to Sync" : "Photos on Their Way",
          systemImage: "icloud.and.arrow.down", description: Text(photosComing))
          .accessibilityIdentifier("media-library.on-their-way")
      } else if items.isEmpty {
        ContentUnavailableView(
          "No Saved Images",
          systemImage: "photo.on.rectangle.angled",
          description: Text("Images you open words from in Image Search will appear here.")
        )
        .accessibilityIdentifier("media-library.empty")
      } else {
        List {
          if let photosComing {
            Label(photosComing, systemImage: "icloud.and.arrow.down")
              .foregroundStyle(.secondary)
              .accessibilityIdentifier("media-library.on-their-way")
          }
          ForEach(items) { item in
            NavigationLink {
              EncounterMediaDetail(item: item, store: store)
            } label: {
              EncounterMediaRow(item: item, store: store)
            }
            .accessibilityIdentifier("media-library.item.\(item.id)")
            .rowActions {
              Button("Delete", role: .destructive) {
                delete(item.id)
              }
            }
          }
        }
        .accessibilityIdentifier("media-library.list")
      }
    }
    .navigationTitle("Media Library")
    .task(id: zenbuAccount?.sync.keptRevision) { items = await store.library() }
  }

  private func delete(_ mediaID: String) {
    Task { @MainActor in
      await store.deleteMedia(mediaID)
      items = await store.library()
    }
  }
}

private struct EncounterMediaRow: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  @State private var image: Image?
  let item: EncounterMediaSummary
  let store: EncounterMediaStore

  var body: some View {
    HStack(spacing: 12) {
      if let image {
        image
          .resizable()
          .scaledToFill()
          .frame(width: 72, height: 72)
          .clipShape(.rect(cornerRadius: 8))
          .clipped()
      }
      VStack(alignment: .leading, spacing: 4) {
        Text(item.name).font(.headline).lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
        Text(item.words.map(\.headword).joined(separator: " · "))
          .font(.body)
          .foregroundStyle(.secondary)
          .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
        RomajiReadingAidText(
          romaji: encounterRomaji,
          lineLimit: 2,
          accessibilityIdentifier: "media-library.romaji.\(item.id)"
        )
        Text(item.savedAt, style: .date)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .task(id: item.id) {
      image = await store.media(item.id).flatMap { Image(imageData: $0.data) }
    }
  }

  private var encounterRomaji: String? {
    let values = item.words.compactMap { PresentationCore.shared.romaji($0.reading) }
    return values.count == item.words.count ? values.joined(separator: " · ") : nil
  }
}

private struct EncounterMediaDetail: View {
  @State private var media: EncounterMedia?
  let item: EncounterMediaSummary
  let store: EncounterMediaStore

  var body: some View {
    List {
      if let media, let image = Image(imageData: media.data) {
        Section {
          image
            .resizable()
            .scaledToFit()
        }
      }

      Section("Associated Words") {
        ForEach(item.words, id: \.id) { word in
          LabeledContent {
            JapaneseRubyText(ruby: JapaneseRuby(surface: word.headword, reading: word.reading))
          } label: {
            Text("Word")
          }
        }
      }
    }
    .navigationTitle(item.name)
    .inlineNavigationTitle()
    .task(id: item.id) { media = await store.media(item.id) }
  }
}
