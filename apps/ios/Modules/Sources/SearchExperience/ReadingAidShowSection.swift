import SwiftUI

struct ReadingAidShowSection: View {
  @Environment(ReadingAidPreferences.self) private var readingAidPreferences

  var body: some View {
    @Bindable var preferences = readingAidPreferences
    Section("Show") {
      Toggle("Furigana", isOn: $preferences.showsFurigana)
      Toggle("Furigana on Known Words", isOn: $preferences.showsFuriganaOnKnownWords)
        .disabled(!preferences.showsFurigana)
      Toggle("Word Meanings", isOn: $preferences.showsWordMeanings)
      Toggle("Translations", isOn: $preferences.showsTranslations)
    }
    .keepsItsMenuOpen()
  }
}
