import Foundation
import Testing
import TranslatorCore

@testable import SearchExperience

@MainActor
@Suite("Translate across windows")
struct TranslateWindowTests {
  @Test("closing the last window while Translate is starting leaves it stopped")
  func lastWindowDuringStart() async throws {
    let defaults = MemoryDefaults()
    let folder = FileManager.default.temporaryDirectory
      .appending(path: "translate-windows-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: folder) }
    let microphone = AsyncStream<Bool>.makeStream()
    var services = TranslateServices.scripted(.station)
    services.requestMicrophone = {
      for await granted in microphone.stream { return granted }
      return false
    }
    let experience = TranslateExperience(
      services: services, history: ConversationHistory(directory: folder), defaults: defaults)

    let starting = Task { await experience.start(.conversation) }
    while !experience.isPreparing { await Task.yield() }
    experience.lastWindowClosed()
    microphone.continuation.yield(true)
    await starting.value

    #expect(experience.session == nil)
    #expect(!experience.isPreparing)
  }
}
