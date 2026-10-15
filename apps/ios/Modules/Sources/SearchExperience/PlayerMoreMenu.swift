import SwiftUI

struct PlayerMoreMenu: View {
  let videoID: YouTubeVideoID
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences

  var body: some View {
    @Bindable var preferences = readingAidPreferences
    Menu("More", systemImage: "ellipsis") {
      Section("Show") {
        Toggle("Furigana", isOn: $preferences.showsFurigana)
        Toggle("Furigana on Known Words", isOn: Binding(
          get: { !preferences.hidesFuriganaOnKnownWords },
          set: { preferences.hidesFuriganaOnKnownWords = !$0 }
        ))
        .disabled(!preferences.showsFurigana)
        Toggle("Word Meanings", isOn: $preferences.showsWordMeanings)
        Toggle("Translations", isOn: $preferences.showsTranslations)
      }
      Section {
        ShareLink(item: URL(string: "https://youtu.be/\(videoID.rawValue)")!) {
          Label("Share Video", systemImage: "square.and.arrow.up")
        }
      }
    }
    .accessibilityIdentifier("watch.more")
  }
}
