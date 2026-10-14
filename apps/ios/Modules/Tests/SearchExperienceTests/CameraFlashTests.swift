import Foundation
import Testing

@testable import SearchExperience

@Suite("The camera's flash")
struct CameraFlashTests {
  private static func withFreshDefaults(_ body: (String) throws -> Void) throws {
    let suite = "camera-flash-tests-\(UUID().uuidString)"
    defer { UserDefaults(suiteName: suite)?.removePersistentDomain(forName: suite) }
    try body(suite)
  }

  @Test("the camera opens with its flash off until the learner chooses one")
  func offByDefault() throws {
    try Self.withFreshDefaults { suite in
      let defaults = try #require(UserDefaults(suiteName: suite))
      #expect(CameraFlash.remembered(in: defaults) == .off)
    }
  }

  @Test("the camera opens with the flash the learner last chose", arguments: CameraFlash.allCases)
  func remembersTheLearnersChoice(choice: CameraFlash) throws {
    try Self.withFreshDefaults { suite in
      let defaults = try #require(UserDefaults(suiteName: suite))
      let other = CameraFlash.allCases.first { $0 != choice } ?? .off
      other.remember(in: defaults)
      choice.remember(in: defaults)
      let reopened = try #require(UserDefaults(suiteName: suite))
      #expect(CameraFlash.remembered(in: reopened) == choice)
    }
  }

  @Test("a saved flash this version doesn't know opens the camera with the flash off")
  func unknownChoiceIsOff() throws {
    try Self.withFreshDefaults { suite in
      let defaults = try #require(UserDefaults(suiteName: suite))
      defaults.set("torch", forKey: CameraFlash.storageKey)
      #expect(CameraFlash.remembered(in: defaults) == .off)
    }
  }
}
