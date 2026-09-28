import SwiftUI
import Testing
@testable import SearchExperience

@MainActor
@Suite("Word sheet presentation")
struct WordSheetPresentationTests {
  private func request(_ surface: String) -> RecognizedWordSheetRequest {
    RecognizedWordSheetRequest(
      id: surface,
      surface: surface,
      entry: nil,
      candidateEntries: [],
      encounterMedia: nil
    )
  }

  @Test("a word opens at half height")
  func opensAtHalfHeight() {
    let presentation = WordSheetPresentation()
    presentation.request = request("木")
    #expect(presentation.isPresented)
    #expect(presentation.detent == .medium)
  }

  @Test("tapping another word while the sheet is open keeps it open, at half height")
  func switchingWordsStaysAtHalfHeight() {
    let presentation = WordSheetPresentation()
    presentation.request = request("木")
    let isPresented = presentation.isPresentedBinding

    presentation.request = request("森")

    #expect(isPresented.wrappedValue)
    #expect(presentation.request?.surface == "森")
    #expect(presentation.detent == .medium)
  }

  @Test("a word tapped after the sheet was dragged to full height opens at half height")
  func newWordResetsExpandedSheet() {
    let presentation = WordSheetPresentation()
    presentation.request = request("木")
    presentation.detent = .large

    presentation.request = request("森")

    #expect(presentation.detent == .medium)
  }

  @Test("closing the sheet clears the word")
  func closingClearsTheWord() {
    let presentation = WordSheetPresentation()
    presentation.request = request("木")

    presentation.isPresentedBinding.wrappedValue = false

    #expect(presentation.request == nil)
    #expect(!presentation.isPresented)
  }
}
