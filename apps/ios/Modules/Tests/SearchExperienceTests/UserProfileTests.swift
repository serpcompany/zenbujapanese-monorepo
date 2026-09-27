import Foundation
import Testing
@testable import SearchExperience

@Suite("Profile field rules")
struct UserProfileTests {
  @Test("usernames drop leading @, lowercase, and keep only a–z, digits, _ and .")
  func usernameNormalization() {
    #expect(UserProfile.normalizedUsername("@devinschumacher") == "devinschumacher")
    #expect(UserProfile.normalizedUsername("@@Devin Schumacher!") == "devinschumacher")
    #expect(UserProfile.normalizedUsername("devin_s.92") == "devin_s.92")
    #expect(UserProfile.normalizedUsername("dev@in") == "devin")
  }

  @Test("usernames drop Japanese and full-width characters")
  func usernameScripts() {
    #expect(UserProfile.normalizedUsername("でびん") == "")
    #expect(UserProfile.normalizedUsername("ｄｅｖｉｎ") == "")
    #expect(UserProfile.normalizedUsername("devinでびん") == "devin")
  }

  @Test("usernames are capped at the length limit")
  func usernameLength() {
    let long = String(repeating: "a", count: 50)
    #expect(UserProfile.normalizedUsername(long).count == UserProfile.usernameLengthLimit)
  }

  @Test("email validation accepts one address and nothing else")
  func emailValidation() {
    #expect(UserProfile.isValidEmail("devin@serp.co"))
    #expect(UserProfile.isValidEmail("m.name+tag@example.co.jp"))
    #expect(!UserProfile.isValidEmail(""))
    #expect(!UserProfile.isValidEmail("devin"))
    #expect(!UserProfile.isValidEmail("devin@"))
    #expect(!UserProfile.isValidEmail("https://example.com"))
    #expect(!UserProfile.isValidEmail("a@example.com b@example.com"))
  }

  @MainActor
  @Test("profile fields survive a reload")
  func persistence() throws {
    let suite = "user-profile-tests-\(UUID().uuidString)"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let photoURL = FileManager.default.temporaryDirectory.appending(path: "\(suite).jpg")

    let profile = UserProfile(defaults: defaults, photoURL: photoURL)
    profile.name = "Devin Schumacher"
    profile.username = "devin"
    profile.email = "devin@serp.co"

    let reloaded = UserProfile(defaults: defaults, photoURL: photoURL)
    #expect(reloaded.name == "Devin Schumacher")
    #expect(reloaded.username == "devin")
    #expect(reloaded.email == "devin@serp.co")
    #expect(reloaded.initials == "DS")
  }
}
