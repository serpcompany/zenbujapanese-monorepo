import SwiftUI
import UIKit

struct MoreView: View {
  let store: EncounterMediaStore

  var body: some View {
    List {
      NavigationLink {
        MediaLibraryView(store: store)
      } label: {
        HStack {
          Label("Media Library", systemImage: "photo.on.rectangle.angled")
            .font(.body)
          Spacer(minLength: 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityHidden(true)
      }
      .accessibilityLabel("Media Library")
      .accessibilityIdentifier("more.media-library")

      NavigationLink {
        DictionarySourcesView()
      } label: {
        HStack {
          Label("Credits & Attributions", systemImage: "info.circle")
            .font(.body)
          Spacer(minLength: 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityHidden(true)
      }
      .accessibilityLabel("Credits & Attributions")
      .accessibilityIdentifier("more.credits")
    }
    .navigationTitle("More")
  }
}

struct MediaLibraryView: View {
  @State private var items: [EncounterMediaSummary] = []
  let store: EncounterMediaStore

  var body: some View {
    Group {
      if items.isEmpty {
        VStack(spacing: 12) {
          Image(systemName: "photo.on.rectangle.angled")
            .font(.largeTitle)
            .accessibilityHidden(true)
          Text("No Encounter Media")
            .font(.title3.weight(.semibold))
          Text("Images saved with words from Image Text will appear here.")
            .font(.body)
            .foregroundStyle(ZenbuTheme.secondaryText)
            .multilineTextAlignment(.center)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
          .foregroundStyle(ZenbuTheme.secondaryText)
          .lineLimit(2)
        Text(item.savedAt, style: .date)
          .font(.caption)
          .foregroundStyle(ZenbuTheme.secondaryText)
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
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        if let media, let image = UIImage(data: media.data) {
          Image(uiImage: image).resizable().scaledToFit()
        }
        Text("Associated Words").font(.headline)
        ForEach(item.words, id: \.id) { word in
          JapaneseRubyText(surface: word.headword, reading: word.reading)
        }
      }
      .padding()
    }
    .navigationTitle(item.name)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: item.id) { media = await store.media(item.id) }
  }
}
