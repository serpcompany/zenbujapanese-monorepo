import SwiftUI
import UIKit

struct MoreView: View {
  let store: EncounterMediaStore

  var body: some View {
    List {
      NavigationLink {
        MediaLibraryView(store: store)
      } label: {
        Label("Media Library", systemImage: "photo.on.rectangle.angled")
      }
      .accessibilityIdentifier("more.media-library")

      NavigationLink {
        DictionarySourcesView()
      } label: {
        Label("Credits & Attributions", systemImage: "info.circle")
      }
      .accessibilityIdentifier("more.credits")
    }
    .accessibilityIdentifier("more.list")
    .navigationTitle("More")
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
        Text(item.savedAt, style: .date)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .task(id: item.id) {
      image = await store.media(item.id).flatMap { UIImage(data: $0.data) }
    }
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
