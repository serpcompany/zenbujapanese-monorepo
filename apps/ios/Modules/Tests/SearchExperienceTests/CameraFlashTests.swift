import Foundation
import Testing

@testable import SearchExperience

@Suite("The camera's flash")
struct CameraFlashTests {
  @Test("the flash kept for the camera is off until the learner chooses one")
  func offByDefault() {
    let defaults = MemoryDefaults()
    #expect(CameraFlash.remembered(in: defaults) == .off)
  }

  @Test(
    "the flash kept for the camera is the one the learner last chose",
    arguments: CameraFlash.allCases)
  func remembersTheLearnersChoice(choice: CameraFlash) {
    let defaults = MemoryDefaults()
    let other = CameraFlash.allCases.first { $0 != choice } ?? .off
    other.remember(in: defaults)
    choice.remember(in: defaults)
    #expect(CameraFlash.remembered(in: defaults) == choice)
  }

  @Test("a kept flash this version doesn't know leaves the camera's flash off")
  func unknownChoiceIsOff() {
    let defaults = MemoryDefaults()
    defaults.set("torch", forKey: CameraFlash.storageKey)
    #expect(CameraFlash.remembered(in: defaults) == .off)
  }
}
