import SwiftUI
import UIKit

struct YouNavigationView: View {
  @Binding var path: [YouRoute]
  let store: EncounterMediaStore

  var body: some View {
    NavigationStack(path: $path) {
      YouRootView()
        .navigationDestination(for: YouRoute.self) { route in
          switch route {
          case .readingAids:
            ReadingAidSettingsView()
          case .mediaLibrary:
            MediaLibraryView(store: store)
          case .frequencyDictionaries:
            FrequencyDictionariesView(client: .live)
          case .languageTechnology:
            LanguageTechnologyPacksView(client: .live)
          case .credits:
            DictionarySourcesView()
          }
        }
    }
  }
}

struct YouRootView: View {
  var body: some View {
    List {
      Section("Your Content") {
        NavigationLink(value: YouRoute.mediaLibrary) {
          Label("Media Library", systemImage: "photo.on.rectangle.angled")
        }
        .accessibilityIdentifier("you.media-library")
      }

      Section("Preferences") {
        NavigationLink(value: YouRoute.readingAids) {
          Label("Reading Aids", systemImage: "character.book.closed")
        }
        .accessibilityIdentifier("you.reading-aids")
      }

      Section("Language Resources") {
        NavigationLink(value: YouRoute.frequencyDictionaries) {
          Label("Frequency Dictionaries", systemImage: "chart.bar.xaxis")
        }
        .accessibilityIdentifier("you.frequency-dictionaries")

        NavigationLink(value: YouRoute.languageTechnology) {
          Label("Japanese Text Analysis", systemImage: "text.magnifyingglass")
        }
        .accessibilityIdentifier("you.japanese-analysis")
      }

      Section("About") {
        NavigationLink(value: YouRoute.credits) {
          Label("Credits & Attributions", systemImage: "info.circle")
        }
        .accessibilityIdentifier("you.credits")
      }
    }
    .accessibilityIdentifier("you.list")
    .navigationTitle("You")
  }
}

enum YouRoute: Hashable {
  case readingAids
  case mediaLibrary
  case frequencyDictionaries
  case languageTechnology
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
