import SwiftUI

extension AccountRootView {
  @ViewBuilder var libraryRows: some View {
    NavigationLink(value: AccountRoute.mediaLibrary) {
      SettingsRowLabel("Media Library", systemImage: "photo.on.rectangle.angled", tint: .orange)
    }
    .accessibilityIdentifier("account.media-library")

    markedWordsRow(.known)
    markedWordsRow(.learning)
  }

  @ViewBuilder var settingsRows: some View {
    NavigationLink(value: AccountRoute.readingAids) {
      SettingsRowLabel("Reading Aids", systemImage: "character.book.closed.fill", tint: .blue)
    }
    .accessibilityIdentifier("account.reading-aids")

    NavigationLink(value: AccountRoute.frequencyDictionaries) {
      SettingsRowLabel("Frequency Dictionaries", systemImage: "chart.bar.fill", tint: .green)
    }
    .accessibilityIdentifier("account.frequency-dictionaries")
  }

  @ViewBuilder var collectionRows: some View {
    NavigationLink(value: AccountRoute.wordLists) {
      AccountCountRowLabel(
        "Lists", systemImage: "list.bullet.rectangle.fill", tint: .indigo,
        count: wordLists.isLoaded ? wordLists.ownLists.count : nil)
    }
    .accessibilityIdentifier("account.lists")

    NavigationLink(value: TranslateRoute.history) {
      AccountCountRowLabel(
        "Translations", systemImage: "translate", tint: .purple,
        count: translationHistory.isLoaded ? translationHistory.saved.count : nil)
    }
    .accessibilityIdentifier("account.translations")

    if !notesWithoutAWord.notes.isEmpty {
      NavigationLink(value: AccountRoute.notesWithoutAWord) {
        AccountCountRowLabel(
          "Notes Without a Word", systemImage: "note.text", tint: .yellow,
          count: notesWithoutAWord.notes.count)
      }
      .accessibilityIdentifier("account.notes-without-a-word")
    }
  }

  private func markedWordsRow(_ words: MarkedWords) -> some View {
    NavigationLink(value: AccountRoute.marked(words.status)) {
      AccountCountRowLabel(
        LocalizedStringKey(words.title), systemImage: words.rowSymbol, tint: words.tint,
        count: wordKnowledge.isLoaded ? wordKnowledge.marked(words.status).count : nil)
    }
    .accessibilityIdentifier("account.\(words.identifier)")
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
