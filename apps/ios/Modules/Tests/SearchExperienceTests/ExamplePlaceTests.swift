import Foundation
import SwiftUI
import Testing

@testable import SearchExperience

@MainActor
@Suite("Example Sentences' place", .timeLimit(.minutes(1)))
struct ExamplePlaceTests {
  private let opened = Self.sentence(22)
  private let above = Self.sentence(5)
  private let list = CGRect(x: 0, y: 100, width: 400, height: 800)

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

  private func leftFromTheOpenedRow() -> ExamplePlaceKeeper {
    let keeper = ExamplePlaceKeeper()
    keeper.noteList(list)
    _ = keeper.note(opened, at: row(at: 400), now: at(0))
    keeper.leave(from: opened)
    return keeper
  }

  @Test("the sentence a word was opened from is put back where it was when the screen comes back")
  func theOpenedSentenceIsPutBack() {
    let keeper = leftFromTheOpenedRow()
    #expect(keeper.left == ExamplePlace(row: opened, top: 400, height: 80))
    let back = keeper.comeBack(now: at(10))
    #expect(back == ExamplePlaceCorrection(row: opened, anchor: UnitPoint(x: 0.5, y: 400 / 720)))
  }

  @Test("while the screen settles, each layout puts it back again, one correction at a time")
  func eachLayoutWhileSettlingPutsItBack() {
    let keeper = leftFromTheOpenedRow()
    #expect(keeper.comeBack(now: at(10)) != nil)
    #expect(keeper.note(above, at: row(at: -300), now: at(10.1)) == nil)
    keeper.corrected()
    #expect(keeper.note(above, at: row(at: -500), now: at(10.2)) != nil)
    keeper.corrected()
    #expect(keeper.note(above, at: row(at: -500), now: at(10 + ExamplePlaceKeeper.settling)) == nil)
    #expect(keeper.left == nil)
  }

  @Test("a sentence that came back taller is put back by its new height")
  func aTallerSentenceIsPutBackByItsNewHeight() {
    let keeper = leftFromTheOpenedRow()
    _ = keeper.note(opened, at: row(at: 700, height: 100), now: at(5))
    let back = keeper.comeBack(now: at(10))
    #expect(back == ExamplePlaceCorrection(row: opened, anchor: UnitPoint(x: 0.5, y: 400 / 700)))
  }

  @Test("scrolling by hand ends putting it back")
  func scrollingByHandEndsIt() {
    let keeper = leftFromTheOpenedRow()
    #expect(keeper.comeBack(now: at(10)) != nil)
    keeper.corrected()
    keeper.userScrolled()
    #expect(keeper.note(above, at: row(at: -500), now: at(10.2)) == nil)
    #expect(keeper.left == nil)
  }

  @Test("nothing is put back on a first appearance, for a sentence never laid out, or once settled")
  func nothingIsPutBackOtherwise() {
    let fresh = ExamplePlaceKeeper()
    #expect(fresh.comeBack(now: at(10)) == nil)

    let unseen = ExamplePlaceKeeper()
    unseen.noteList(list)
    unseen.leave(from: opened)
    #expect(unseen.left == nil)
    #expect(unseen.comeBack(now: at(10)) == nil)

    let settled = leftFromTheOpenedRow()
    #expect(settled.comeBack(now: at(10)) != nil)
    settled.corrected()
    #expect(settled.comeBack(now: at(20)) == nil)
    #expect(settled.left == nil)
  }

  @Test("a place near either edge of the list is held at that edge")
  func anEdgeIsHeld() {
    let place = ExamplePlace(row: opened, top: 900, height: 80)
    #expect(place.anchor(rowHeight: 80, listHeight: 800) == UnitPoint(x: 0.5, y: 1))
    let overTheTop = ExamplePlace(row: opened, top: -40, height: 80)
    #expect(overTheTop.anchor(rowHeight: 80, listHeight: 800).y == 0)
    #expect(place.anchor(rowHeight: 900, listHeight: 800) == .top)
  }
}
