import Foundation
import SwiftUI
import Testing

@testable import SearchExperience

@MainActor
@Suite("Example Sentences' place", .timeLimit(.minutes(1)))
struct ExamplePlaceTests {
  private let opened = Self.sentence(22)
  private let above = Self.sentence(5)
  private let list = CGRect(x: 0, y: 100, width: 400, height: 900)

  private static func sentence(_ number: Int) -> ExampleSentenceID {
    let digits = String(number, radix: 16)
    let padded = String(repeating: "0", count: 32 - digits.count) + digits
    return ExampleSentenceID(rawValue: "esp1_" + padded)!
  }

  private func at(_ second: TimeInterval) -> Date {
    Date(timeIntervalSince1970: second)
  }

  private func row(at top: CGFloat, height: CGFloat = 80) -> CGRect {
    CGRect(x: 0, y: list.minY + top, width: list.width, height: height)
  }

  private func leftFrom(_ top: CGFloat) -> ExamplePlaceKeeper {
    let keeper = ExamplePlaceKeeper()
    keeper.noteList(list)
    _ = keeper.note(opened, at: row(at: top), now: at(0))
    keeper.leave(from: opened)
    return keeper
  }

  @Test("a sentence that came back near where it was is left alone")
  func aSentenceNearItsPlaceIsLeftAlone() {
    let keeper = leftFrom(700)
    #expect(keeper.left == ExamplePlace(row: opened, top: 700))
    #expect(keeper.comeBack(now: at(10)) == nil)
    #expect(keeper.note(opened, at: row(at: 770, height: 86), now: at(10.1)) == nil)
  }

  @Test("a sentence that came back far from its place is put back in its third of the list")
  func aSentenceFarFromItsPlaceIsPutBack() {
    let keeper = leftFrom(700)
    #expect(keeper.comeBack(now: at(10)) == nil)
    let moved = keeper.note(opened, at: row(at: 100), now: at(10.1))
    #expect(moved == ExamplePlaceCorrection(row: opened, anchor: .bottom))
    #expect(keeper.note(opened, at: row(at: 120), now: at(10.2)) == nil)
    keeper.corrected()
    #expect(keeper.note(opened, at: row(at: 820), now: at(10.3)) == nil)
  }

  @Test("a sentence pushed off the list, while others were laid out, is put back")
  func aSentencePushedAwayIsPutBack() {
    let keeper = leftFrom(400)
    #expect(keeper.comeBack(now: at(10)) == nil)
    let back = keeper.note(above, at: row(at: -500), now: at(10.1))
    #expect(back == ExamplePlaceCorrection(row: opened, anchor: .center))
  }

  @Test("a return while the list is covered doesn't use up the next one")
  func aCoveredReturnKeepsThePlace() {
    let keeper = leftFrom(100)
    #expect(keeper.comeBack(now: at(10)) == nil)
    #expect(keeper.comeBack(now: at(20)) == nil)
    #expect(keeper.left != nil)
    let moved = keeper.note(opened, at: row(at: 800), now: at(20.1))
    #expect(moved == ExamplePlaceCorrection(row: opened, anchor: .top))
  }

  @Test("the place is forgotten once the list settles on screen, or when it is scrolled by hand")
  func thePlaceIsForgotten() {
    let settled = leftFrom(400)
    _ = settled.comeBack(now: at(10))
    _ = settled.note(opened, at: row(at: 400), now: at(10.1))
    _ = settled.note(above, at: row(at: 0), now: at(10 + ExamplePlaceKeeper.settling))
    #expect(settled.left == nil)

    let scrolled = leftFrom(400)
    _ = scrolled.comeBack(now: at(10))
    scrolled.userScrolled()
    #expect(scrolled.note(opened, at: row(at: -300), now: at(10.2)) == nil)
    #expect(scrolled.left == nil)
  }

  @Test("nothing is put back on a first appearance, or for a sentence never laid out")
  func nothingIsPutBackWithoutAPlace() {
    #expect(ExamplePlaceKeeper().comeBack(now: at(10)) == nil)
    let unseen = ExamplePlaceKeeper()
    unseen.noteList(list)
    unseen.leave(from: opened)
    #expect(unseen.left == nil)
    #expect(unseen.comeBack(now: at(10)) == nil)
  }

  @Test("a place is held at the top, the middle, or the bottom, whichever third it was in")
  func aPlaceIsHeldInItsThird() {
    #expect(ExamplePlace(row: opened, top: 100).anchor(rowHeight: 80, listHeight: 900) == .top)
    #expect(ExamplePlace(row: opened, top: 400).anchor(rowHeight: 80, listHeight: 900) == .center)
    #expect(ExamplePlace(row: opened, top: 700).anchor(rowHeight: 80, listHeight: 900) == .bottom)
    #expect(ExamplePlace(row: opened, top: 700).anchor(rowHeight: 950, listHeight: 900) == .top)
  }
}
