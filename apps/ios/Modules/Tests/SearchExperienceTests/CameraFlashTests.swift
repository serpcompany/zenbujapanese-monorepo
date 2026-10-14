import Foundation
import Testing

@testable import SearchExperience

@Suite("The camera's flash")
struct CameraFlashTests {
  @Test("the flash kept for the camera is off until the learner chooses one")
  func offByDefault() throws {
    let temporary = try TemporaryDefaults()
    #expect(CameraFlash.remembered(in: temporary.defaults) == .off)
  }

  @Test(
    "the flash kept for the camera is the one the learner last chose",
    arguments: CameraFlash.allCases)
  func remembersTheLearnersChoice(choice: CameraFlash) throws {
    let temporary = try TemporaryDefaults()
    let other = CameraFlash.allCases.first { $0 != choice } ?? .off
    other.remember(in: temporary.defaults)
    choice.remember(in: temporary.defaults)
    let reopened = try #require(UserDefaults(suiteName: temporary.suite))
    #expect(CameraFlash.remembered(in: reopened) == choice)
  }

  @Test("a kept flash this version doesn't know leaves the camera's flash off")
  func unknownChoiceIsOff() throws {
    let temporary = try TemporaryDefaults()
    temporary.defaults.set("torch", forKey: CameraFlash.storageKey)
    #expect(CameraFlash.remembered(in: temporary.defaults) == .off)
  }
}
