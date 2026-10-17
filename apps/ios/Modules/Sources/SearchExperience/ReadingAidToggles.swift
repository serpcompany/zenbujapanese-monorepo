import SwiftUI

struct ReadingAidToggles: View {
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences

  var body: some View {
    @Bindable var preferences = readingAidPreferences
    Toggle("Furigana", isOn: $preferences.showsFurigana)
    Toggle("Furigana on Known Words", isOn: Binding(
      get: { !preferences.hidesFuriganaOnKnownWords },
      set: { preferences.hidesFuriganaOnKnownWords = !$0 }
    ))
    .disabled(!preferences.showsFurigana)
    Toggle("Word Meanings", isOn: $preferences.showsWordMeanings)
  }
}
