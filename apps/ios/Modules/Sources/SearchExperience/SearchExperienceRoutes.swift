import SwiftUI

struct ImageWordContext: Hashable {
  let sessionID: UUID
  let assetID: UUID
}

enum DictionaryStack {
  case search
  case player
  case translate
  case account
}

enum PlayerRoute: Hashable {
  case video(YouTubeVideoID)
  case search(VideoSearch)
}

enum SearchExperienceRoute: Hashable {
  case word(DictionaryEntry, ImageWordContext?)
  case kanji(KanjiCharacter, DictionaryEntry?)
  case kanjiElement(KanjiElementID)
  case examples(SearchQuery, DictionaryEntry?, Bool)
  case conjugations(DictionaryEntry, ConjugationTable)
  case conjugatedForm(DictionaryEntry, ConjugationTable, ConjugatedForm, ConjugationMode)
  case image(UUID)
}

struct DictionaryRoutes<Destination: View, WordSheet: View>: ViewModifier {
  let sheet: WordSheetPresentation
  let destination: (SearchExperienceRoute) -> Destination
  let wordSheet: () -> WordSheet

  func body(content: Content) -> some View {
    content
      .navigationDestination(for: SearchExperienceRoute.self, destination: destination)
      .sheet(isPresented: sheet.isPresentedBinding, content: wordSheet)
  }
}
