import SwiftUI
import UIKit

struct AccountNavigationView: View {
  @Binding var path: [AccountRoute]
  let store: EncounterMediaStore

  var body: some View {
    NavigationStack(path: $path) {
      AccountRootView()
        .navigationDestination(for: AccountRoute.self) { route in
          switch route {
          case .readingAids:
            ReadingAidSettingsView()
          case .mediaLibrary:
            MediaLibraryView(store: store)
          case .frequencyDictionaries:
            FrequencyDictionariesView(client: .live)
          case .credits:
            DictionarySourcesView()
          }
        }
    }
  }
}

struct AccountRootView: View {
  var body: some View {
    List {
      Section {
        NavigationLink(value: AccountRoute.mediaLibrary) {
          AccountRowLabel("Media Library", systemImage: "photo.on.rectangle.angled", tint: .orange)
        }
        .accessibilityIdentifier("account.media-library")
      }

      Section {
        NavigationLink(value: AccountRoute.readingAids) {
          AccountRowLabel("Reading Aids", systemImage: "character.book.closed.fill", tint: .blue)
        }
        .accessibilityIdentifier("account.reading-aids")

        NavigationLink(value: AccountRoute.frequencyDictionaries) {
          AccountRowLabel("Frequency Dictionaries", systemImage: "chart.bar.fill", tint: .green)
        }
        .accessibilityIdentifier("account.frequency-dictionaries")
      }

      Section {
        AccountExternalLink(destination: AccountLinks.support) {
          AccountRowLabel("Help & Support", systemImage: "questionmark.bubble.fill", tint: .red)
        }
        .accessibilityIdentifier("account.support")
      }

      Section {
        AccountAboutHeader()
          .listRowBackground(Color.clear)
          .listRowInsets(EdgeInsets(top: 8, leading: 4, bottom: 8, trailing: 4))
      }

      Section {
        AccountExternalLink(destination: AccountLinks.privacyPolicy) {
          AccountRowLabel("Privacy Policy", systemImage: "hand.raised.fill", tint: .blue)
        }
        .accessibilityIdentifier("account.privacy-policy")

        NavigationLink(value: AccountRoute.credits) {
          AccountRowLabel("Credits & Attributions", systemImage: "text.book.closed.fill", tint: .gray)
        }
        .accessibilityIdentifier("account.credits")
      }
    }
    .listSectionSpacing(.compact)
    .accessibilityIdentifier("account.list")
    .navigationTitle("Account")
  }
}

/// A Settings-style row: a white symbol on a rounded, tinted tile, then the title.
private struct AccountRowLabel: View {
  let title: String
  let systemImage: String
  let tint: Color

  init(_ title: String, systemImage: String, tint: Color) {
    self.title = title
    self.systemImage = systemImage
    self.tint = tint
  }

  var body: some View {
    Label {
      Text(title)
        .foregroundStyle(.primary)
    } icon: {
      Image(systemName: systemImage)
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(.white)
        .frame(width: 30, height: 30)
        .background(tint.gradient, in: .rect(cornerRadius: 7))
    }
  }
}

/// A row that opens a web page, marked the way Settings marks rows that leave the app.
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
      HStack(spacing: 12) {
        if let icon = AppBundleInfo.icon {
          Image(uiImage: icon)
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
  // Kept in step with apps/ios/metadata App Store listing URLs.
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

  /// The compiled asset catalog exposes the app icon only through its Info.plist file names.
  static var icon: UIImage? {
    guard
      let icons = Bundle.main.object(forInfoDictionaryKey: "CFBundleIcons") as? [String: Any],
      let primary = icons["CFBundlePrimaryIcon"] as? [String: Any]
    else { return nil }
    let names = (primary["CFBundleIconFiles"] as? [String] ?? []).reversed()
      + [primary["CFBundleIconName"] as? String].compactMap { $0 }
    return names.lazy.compactMap { UIImage(named: $0) }.first
  }
}

enum AccountRoute: Hashable {
  case readingAids
  case mediaLibrary
  case frequencyDictionaries
  case credits
}

private struct ReadingAidSettingsView: View {
  @Environment(ReadingAidPreferences.self) private var preferences

  var body: some View {
    @Bindable var preferences = preferences
    Form {
      Section {
        Toggle("Show Furigana", isOn: $preferences.showsFurigana)
          .accessibilityIdentifier("reading-aids.show-furigana")
        Toggle("Show Romaji", isOn: $preferences.showsRomaji)
          .accessibilityIdentifier("reading-aids.show-romaji")
      } header: {
        Text("Reading Aids")
      } footer: {
        Text(
          "Furigana appears above kanji. Romaji uses Apple’s system romanization and appears below complete Japanese text."
        )
      }
    }
    .accessibilityIdentifier("reading-aids.form")
    .navigationTitle("Reading Aids")
    .navigationBarTitleDisplayMode(.inline)
  }
}

struct MediaLibraryView: View {
  @State private var items: [EncounterMediaSummary] = []
  let store: EncounterMediaStore

  var body: some View {
    Group {
      if items.isEmpty {
        ContentUnavailableView(
          "No Encounter Media",
          systemImage: "photo.on.rectangle.angled",
          description: Text("Images saved with words from Image Text will appear here.")
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
            .swipeActions {
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
  @State private var image: UIImage?
  let item: EncounterMediaSummary
  let store: EncounterMediaStore

  var body: some View {
    HStack(spacing: 12) {
      if let image {
        Image(uiImage: image)
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
      image = await store.media(item.id).flatMap { UIImage(data: $0.data) }
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
      if let media, let image = UIImage(data: media.data) {
        Section {
          Image(uiImage: image)
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
    .navigationBarTitleDisplayMode(.inline)
    .task(id: item.id) { media = await store.media(item.id) }
  }
}
