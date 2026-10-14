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

  @Test("a sentence that came back where it was is left alone")
  func aSentenceInPlaceIsLeftAlone() {
    let keeper = leftFromTheOpenedRow()
    #expect(keeper.left == ExamplePlace(row: opened, top: 400))
    #expect(keeper.comeBack(now: at(10)) == nil)
    #expect(keeper.note(opened, at: row(at: 400.5), now: at(10.1)) == nil)
  }

  @Test("a sentence that came back elsewhere is put back, one correction at a time")
  func aMovedSentenceIsPutBack() {
    let keeper = leftFromTheOpenedRow()
    #expect(keeper.comeBack(now: at(10)) == nil)
    let moved = keeper.note(opened, at: row(at: -300), now: at(10.1))
    #expect(moved == ExamplePlaceCorrection(row: opened, anchor: UnitPoint(x: 0.5, y: 400 / 720)))
    #expect(keeper.note(opened, at: row(at: -280), now: at(10.2)) == nil)
    keeper.corrected()
    #expect(keeper.note(opened, at: row(at: 400), now: at(10.3)) == nil)
  }

  @Test("a sentence pushed off the list, while others were laid out, is put back")
  func aSentencePushedAwayIsPutBack() {
    let keeper = leftFromTheOpenedRow()
    #expect(keeper.comeBack(now: at(10)) == nil)
    #expect(keeper.note(above, at: row(at: -500), now: at(10.1)) != nil)
  }

  @Test("a sentence that came back taller is put back by its new height")
  func aTallerSentenceIsPutBackByItsNewHeight() {
    let keeper = leftFromTheOpenedRow()
    _ = keeper.note(opened, at: row(at: 700, height: 100), now: at(5))
    let back = keeper.comeBack(now: at(10))
    #expect(back == ExamplePlaceCorrection(row: opened, anchor: UnitPoint(x: 0.5, y: 400 / 700)))
  }

  @Test("a return while the list is covered doesn't use up the next one")
  func aCoveredReturnKeepsThePlace() {
    let keeper = leftFromTheOpenedRow()
    #expect(keeper.comeBack(now: at(10)) == nil)
    #expect(keeper.comeBack(now: at(20)) == nil)
    #expect(keeper.left != nil)
    #expect(keeper.note(opened, at: row(at: -300), now: at(20.1)) != nil)
  }

  @Test("the place is forgotten once the list settles on screen, or when it is scrolled by hand")
  func thePlaceIsForgotten() {
    let settled = leftFromTheOpenedRow()
    _ = settled.comeBack(now: at(10))
    _ = settled.note(opened, at: row(at: 400), now: at(10.1))
    _ = settled.note(above, at: row(at: 0), now: at(10 + ExamplePlaceKeeper.settling))
    #expect(settled.left == nil)

    let scrolled = leftFromTheOpenedRow()
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

  @Test("a place near either edge of the list is held at that edge")
  func anEdgeIsHeld() {
    let below = ExamplePlace(row: opened, top: 900)
    #expect(below.anchor(rowHeight: 80, listHeight: 800) == UnitPoint(x: 0.5, y: 1))
    let overTheTop = ExamplePlace(row: opened, top: -40)
    #expect(overTheTop.anchor(rowHeight: 80, listHeight: 800).y == 0)
    #expect(below.anchor(rowHeight: 900, listHeight: 800) == .top)
  }
}
