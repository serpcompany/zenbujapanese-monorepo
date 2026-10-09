import Testing

@testable import SearchExperience

@Suite("The session token in the Keychain", .serialized)
struct KeychainSessionTokenStorageTests {
  static var keychainTakesItems: Bool {
    let storage = KeychainSessionTokenStorage()
    defer { storage.delete() }
    return storage.save("probe")
  }

  @Test(
    "a token is saved, replaced, read back, and deleted",
    .enabled(
      if: keychainTakesItems,
      "a test process signed to run locally on the Mac has no keychain access group"))
  func savesReplacesAndDeletes() {
    let storage = KeychainSessionTokenStorage()
    storage.delete()
    #expect(storage.read() == nil)
    #expect(storage.save("first-session"))
    #expect(KeychainSessionTokenStorage().read() == "first-session")
    #expect(storage.save("second-session"))
    #expect(KeychainSessionTokenStorage().read() == "second-session")
    storage.delete()
    #expect(KeychainSessionTokenStorage().read() == nil)
  }
}
