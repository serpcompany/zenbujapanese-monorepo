import Testing

@testable import SearchExperience

@Suite("Translate's home options")
struct TranslateStartTests {
  @Test("Camera is the fifth option, after Document Upload")
  func cameraFollowsDocumentUpload() {
    #expect(TranslateStart.allCases == [.conversation, .listening, .text, .document, .camera])
  }

  @Test("Camera isn't a live mode, and is named and drawn as a camera")
  func cameraIsNotLive() {
    #expect(TranslateStart.camera.liveMode == nil)
    #expect(TranslateStart.camera.title == "Camera")
    #expect(TranslateStart.camera.systemImage == "camera")
  }

  @Test("a remembered Camera choice reads back as Camera")
  func rememberedCameraChoice() {
    #expect(TranslateStart(rawValue: TranslateStart.camera.rawValue) == .camera)
  }
}
