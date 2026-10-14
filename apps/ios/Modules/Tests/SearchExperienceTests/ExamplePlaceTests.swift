import Foundation
import SwiftUI
import Testing

@testable import SearchExperience

@MainActor
@Suite("Example Sentences' place", .timeLimit(.minutes(1)))
struct ExamplePlaceTests {
  private let opened = Self.sentence(22)
  private let above = Self.sentence(21)
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

  private func returned(from top: CGFloat) -> ExamplePlaceKeeper {
    let keeper = leftFrom(top)
    #expect(keeper.comeBack(now: at(10)))
    #expect(keeper.check(now: at(10)) == nil)
    return keeper
  }

  @Test("a sentence that came back near where it was is left alone")
  func aSentenceNearItsPlaceIsLeftAlone() {
    let keeper = returned(from: 700)
    #expect(keeper.left == ExamplePlace(row: opened, top: 700, height: 80))
    #expect(keeper.note(opened, at: row(at: 770, height: 86), now: at(10.1)))
    #expect(keeper.check(now: at(10.1)) == nil)
  }

  @Test("a sentence that came back far from its place is put back in its third of the list")
  func aSentenceFarFromItsPlaceIsPutBack() {
    let keeper = returned(from: 700)
    #expect(keeper.note(opened, at: row(at: 100), now: at(10.1)))
    #expect(keeper.check(now: at(10.1)) == ExamplePlaceCorrection(row: opened, anchor: .bottom))
    keeper.corrected()
    #expect(keeper.note(opened, at: row(at: 820), now: at(10.3)))
    #expect(keeper.check(now: at(10.3)) == nil)
  }

  @Test("a sentence whose place another row overlaps, without a word from it, is put back")
  func aSentencePushedAwayIsPutBack() {
    let keeper = returned(from: 400)
    #expect(keeper.note(above, at: row(at: 850), now: at(10.1)))
    #expect(keeper.check(now: at(10.1)) == nil)
    #expect(keeper.note(above, at: row(at: 450), now: at(10.2)))
    #expect(keeper.check(now: at(10.2)) == ExamplePlaceCorrection(row: opened, anchor: .center))
  }

  @Test("rows are judged once their layout is over, whatever order they report in")
  func aLayoutIsJudgedWhenItIsOver() {
    let keeper = returned(from: 400)
    #expect(keeper.note(above, at: row(at: 400, height: 75), now: at(10.1)))
    #expect(!keeper.note(opened, at: row(at: 470, height: 86), now: at(10.1)))
    #expect(keeper.check(now: at(10.1)) == nil)
  }

  @Test("a list that shows itself before the path is written, as a swipe back does, is watched")
  func aReturnThatShowsTheListFirstIsWatched() {
    let keeper = leftFrom(100)
    #expect(keeper.comeBack(now: at(10)))
    _ = keeper.note(opened, at: row(at: 100.5), now: at(10.1))
    #expect(keeper.check(now: at(10.1)) == nil)
    #expect(keeper.comeBack(now: at(10.8)))
    _ = keeper.note(above, at: row(at: 20), now: at(10.9))
    #expect(keeper.check(now: at(10.9)) == nil)
    _ = keeper.note(opened, at: row(at: 800), now: at(11))
    #expect(keeper.check(now: at(11)) == ExamplePlaceCorrection(row: opened, anchor: .top))
  }

  @Test("a return while the list is covered doesn't use up or end the next one")
  func aCoveredReturnKeepsThePlace() {
    let keeper = leftFrom(100)
    #expect(keeper.comeBack(now: at(10)))
    #expect(keeper.check(now: at(10)) == nil)
    #expect(!keeper.note(above, at: row(at: 500), now: at(20)))
    #expect(keeper.left != nil)
    #expect(keeper.comeBack(now: at(20.05)))
    _ = keeper.note(opened, at: row(at: 800), now: at(20.1))
    #expect(keeper.check(now: at(20.1)) == ExamplePlaceCorrection(row: opened, anchor: .top))
  }

  @Test("the place is forgotten once a return's list has settled on screen, or is scrolled by hand")
  func thePlaceIsForgotten() {
    let settled = returned(from: 400)
    _ = settled.note(opened, at: row(at: 400.5), now: at(10.1))
    #expect(!settled.comeBack(now: at(20)))
    #expect(settled.left == nil)

    let scrolled = returned(from: 400)
    scrolled.userScrolled()
    #expect(!scrolled.note(opened, at: row(at: -300), now: at(10.2)))
    #expect(scrolled.check(now: at(10.2)) == nil)
    #expect(scrolled.left == nil)
  }

  @Test("a word opened while a correction is pending starts from the new place")
  func aNewPlaceReplacesAPendingCorrection() {
    let keeper = returned(from: 700)
    _ = keeper.note(opened, at: row(at: 100), now: at(10.1))
    #expect(keeper.check(now: at(10.1)) != nil)
    _ = keeper.note(above, at: row(at: 200), now: at(10.2))
    keeper.leave(from: above)
    #expect(keeper.left == ExamplePlace(row: above, top: 200, height: 80))
    #expect(keeper.comeBack(now: at(20)))
    _ = keeper.note(above, at: row(at: 800), now: at(20.1))
    #expect(keeper.check(now: at(20.1)) == ExamplePlaceCorrection(row: above, anchor: .top))
  }

  @Test("nothing is put back on a first appearance, or for a sentence never laid out")
  func nothingIsPutBackWithoutAPlace() {
    #expect(!ExamplePlaceKeeper().comeBack(now: at(10)))
    let unseen = ExamplePlaceKeeper()
    unseen.noteList(list)
    unseen.leave(from: opened)
    #expect(unseen.left == nil)
    #expect(!unseen.comeBack(now: at(10)))
  }

  @Test("a place is held at the top, the middle, or the bottom, whichever third it was in")
  func aPlaceIsHeldInItsThird() {
    let place = { (top: CGFloat) in ExamplePlace(row: opened, top: top, height: 80) }
    #expect(place(100).anchor(rowHeight: 80, listHeight: 900) == .top)
    #expect(place(400).anchor(rowHeight: 80, listHeight: 900) == .center)
    #expect(place(700).anchor(rowHeight: 80, listHeight: 900) == .bottom)
    #expect(place(700).anchor(rowHeight: 950, listHeight: 900) == .top)
  }
}
