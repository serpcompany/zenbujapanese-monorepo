import SwiftUI
import TranslatorCore
@preconcurrency import Translation

struct AccountTabRoot: View {
  let store: EncounterMediaStore
  let translate: TranslateExperience
  let words: TranslateWordLinks
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
        case .knownWords:
          KnownWordsView { openItem($0.entryID, $0.headword, $0.reading) }
        case .wordLists:
          WordListsView()
        case .wordList(let listID):
          WordListView(openedListID: listID) { openItem($0.entryID, $0.headword, $0.reading) }
        case .frequencyDictionaries:
          FrequencyDictionariesView(client: .live)
        case .credits:
          CreditsView()
        }
      }
      .modifier(TranslateDestinations(experience: translate, words: words))
  }
}

struct AccountRootView: View {
  @Environment(WordKnowledge.self) private var wordKnowledge
  @Environment(WordLists.self) private var wordLists
  @Environment(ZenbuAccount.self) private var zenbuAccount: ZenbuAccount?
  let translationHistory: ConversationHistory

  var body: some View {
    List {
      Section {
        NavigationLink(value: AccountRoute.profile) {
          ProfileCardRow()
        }
        .accessibilityIdentifier("account.profile")
        if zenbuAccount != nil {
          ZenbuAccountRow()
        }
      }

      Section {
        NavigationLink(value: AccountRoute.mediaLibrary) {
          SettingsRowLabel("Media Library", systemImage: "photo.on.rectangle.angled", tint: .orange)
        }
        .accessibilityIdentifier("account.media-library")

        NavigationLink(value: AccountRoute.knownWords) {
          AccountCountRowLabel(
            "Known Words", systemImage: "checkmark.circle.fill", tint: .teal,
            count: wordKnowledge.isLoaded ? wordKnowledge.knownCount : nil)
        }
        .accessibilityIdentifier("account.known-words")

        NavigationLink(value: AccountRoute.wordLists) {
          AccountCountRowLabel(
            "Lists", systemImage: "list.bullet.rectangle.fill", tint: .indigo,
            count: wordLists.isLoaded ? wordLists.lists.count : nil)
        }
        .accessibilityIdentifier("account.lists")

        NavigationLink(value: TranslateRoute.history) {
          AccountCountRowLabel(
            "Translations", systemImage: "translate", tint: .purple,
            count: translationHistory.isLoaded ? translationHistory.saved.count : nil)
        }
        .accessibilityIdentifier("account.translations")
      }

      Section {
        NavigationLink(value: AccountRoute.readingAids) {
          SettingsRowLabel("Reading Aids", systemImage: "character.book.closed.fill", tint: .blue)
        }
        .accessibilityIdentifier("account.reading-aids")

        NavigationLink(value: AccountRoute.frequencyDictionaries) {
          SettingsRowLabel("Frequency Dictionaries", systemImage: "chart.bar.fill", tint: .green)
        }
        .accessibilityIdentifier("account.frequency-dictionaries")
      }

      Section {
        AccountAboutHeader()
          .listRowBackground(Color.clear)
          .listRowInsets(EdgeInsets(top: 24, leading: 4, bottom: 8, trailing: 4))
      }

      Section {
        AccountExternalLink(destination: AccountLinks.support) {
          SettingsRowLabel("Help & Support", systemImage: "questionmark.bubble.fill", tint: .red)
        }
        .accessibilityIdentifier("account.support")

        AccountExternalLink(destination: AccountLinks.privacyPolicy) {
          SettingsRowLabel("Privacy Policy", systemImage: "hand.raised.fill", tint: .blue)
        }
        .accessibilityIdentifier("account.privacy-policy")

        NavigationLink(value: AccountRoute.credits) {
          SettingsRowLabel("Credits & Attributions", systemImage: "text.book.closed.fill", tint: .gray)
        }
        .accessibilityIdentifier("account.credits")
      }
    }
    .compactSectionSpacing()
    .accessibilityIdentifier("account.list")
    .navigationTitle("Account")
    .inlineNavigationTitle()
  }
}

private struct AccountCountRowLabel: View {
  let title: LocalizedStringKey
  let systemImage: String
  let tint: Color
  let count: Int?

  init(_ title: LocalizedStringKey, systemImage: String, tint: Color, count: Int?) {
    self.title = title
    self.systemImage = systemImage
    self.tint = tint
    self.count = count
  }

  var body: some View {
    LabeledContent {
      if let count {
        Text(count, format: .number)
      }
    } label: {
      SettingsRowLabel(title, systemImage: systemImage, tint: tint)
    }
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
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize

  var body: some View {
    let layout =
      dynamicTypeSize.isAccessibilitySize
      ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
      : AnyLayout(HStackLayout(spacing: 12))
    VStack(alignment: .leading, spacing: 12) {
      layout {
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

private enum AccountLinks {
  static let support = URL(string: "https://zenbujapanese.com/support")!
  static let privacyPolicy = URL(string: "https://zenbujapanese.com/privacy")!
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

enum AccountRoute: Hashable {
  case profile
  case zenbuAccount
  case readingAids
  case mediaLibrary
  case knownWords
  case wordLists
  case wordList(UUID)
  case frequencyDictionaries
  case credits
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
          "Word meanings show a short meaning under each linked word you haven’t marked known. Sentence translations show a natural translation under Player captions and example sentences. YouTube translates the whole video but can split lines differently; Apple translates each line on your device once its Japanese language is downloaded, and also fills lines YouTube leaves out."
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
  @State private var items: [EncounterMediaSummary] = []
  let store: EncounterMediaStore

  var body: some View {
    Group {
      if items.isEmpty {
        ContentUnavailableView(
          "No Saved Images",
          systemImage: "photo.on.rectangle.angled",
          description: Text("Images you open words from in Image Search will appear here.")
        )
        .accessibilityIdentifier("media-library.empty")
      } else {
        List {
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
    .task { items = await store.library() }
  }

  private func delete(_ mediaID: String) {
    Task { @MainActor in
      await store.deleteMedia(mediaID)
      items = await store.library()
    }
  }
}

private struct EncounterMediaRow: View {
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
        Text(item.name).font(.headline).lineLimit(1)
        Text(item.words.map(\.headword).joined(separator: " · "))
          .font(.body)
          .foregroundStyle(.secondary)
          .lineLimit(2)
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
    let values = item.words.compactMap {
      AppleJapaneseRomanization.romanizeTrustedReading($0.reading)
    }
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
            JapaneseRubyText(surface: word.headword, reading: word.reading)
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
