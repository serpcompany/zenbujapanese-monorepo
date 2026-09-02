import XCTest

@testable import SearchExperience

final class KanjiDetailRestorationTests: XCTestCase {
  func testRestorationWaitsForSettledSnapshotContainingExactWordTarget() {
    let target = KanjiDetailScrollTarget.word(
      LanguageReferenceID(rawValue: "db15f908a4dfe8a0ab6b542af20063d9")
    )

    XCTAssertNil(
      KanjiDetailRestorationState(
        pendingTarget: target,
        snapshot: .loading
      ).readyTarget
    )
    XCTAssertNil(
      KanjiDetailRestorationState(
        pendingTarget: target,
        snapshot: .settled(availableTargets: [])
      ).readyTarget
    )
    XCTAssertEqual(
      KanjiDetailRestorationState(
        pendingTarget: target,
        snapshot: .settled(availableTargets: [target])
      ).readyTarget,
      target
    )
  }

  func testRestorationKeepsWordAndElementTargetsTyped() throws {
    let word = KanjiDetailScrollTarget.word(
      LanguageReferenceID(rawValue: "db15f908a4dfe8a0ab6b542af20063d9")
    )
    let element = KanjiDetailScrollTarget.element(try XCTUnwrap(KanjiElementID("青")))

    XCTAssertNil(
      KanjiDetailRestorationState(
        pendingTarget: word,
        snapshot: .settled(availableTargets: [element])
      ).readyTarget
    )
    XCTAssertEqual(
      KanjiDetailRestorationState(
        pendingTarget: element,
        snapshot: .settled(availableTargets: [word, element])
      ).readyTarget,
      element
    )
  }

  func testSettledDetailDoesNotReloadWhenNativeBackRevealsIt() {
    XCTAssertTrue(KanjiDetailLoadState.loading.requiresLoad)
    XCTAssertFalse(
      KanjiDetailLoadState.loaded(
        reference: nil,
        elements: [],
        relatedWords: []
      ).requiresLoad
    )
    XCTAssertFalse(
      KanjiDetailLoadState.failed(
        reference: nil,
        elements: [],
        relatedWords: []
      ).requiresLoad
    )
  }
}
