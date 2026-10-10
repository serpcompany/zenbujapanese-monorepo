import SwiftUI

struct ImageWordContext: Hashable {
  let sessionID: UUID
  let assetID: UUID
}

enum DictionaryStack: CaseIterable {
  case search
  case player
  case translate
  case account
}

@MainActor
struct DictionaryWordSheets {
  let player = WordSheetPresentation()
  let translate = WordSheetPresentation()
  let account = WordSheetPresentation()

  subscript(stack: DictionaryStack) -> WordSheetPresentation? {
    switch stack {
    case .search: nil
    case .player: player
    case .translate: translate
    case .account: account
    }
  }
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

struct WordSheetHost<WordSheet: View>: ViewModifier {
  let sheet: WordSheetPresentation
  let wordSheet: () -> WordSheet

  func body(content: Content) -> some View {
    content.sheet(isPresented: sheet.isPresentedBinding, content: wordSheet)
  }
}
