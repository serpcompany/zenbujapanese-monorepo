import Foundation
import Testing
@testable import SearchExperience

@Suite("Profile field rules")
struct UserProfileTests {
  private struct SharedUsernames: Decodable {
    struct Accepted: Decodable {
      let covers: String
      let typed: String
      let username: String
    }

    struct Refused: Decodable {
      let covers: String
      let typed: String
    }

    let rule: String
    let accepted: [Accepted]
    let refused: [Refused]
  }

  private static let sharedUsernameCases = URL(filePath: #filePath)
    .deletingLastPathComponent()
    .appending(path: "../../../../account-api/src/domain/username-cases.json")
    .standardizedFileURL

  private func sharedUsernames() throws -> SharedUsernames {
    try JSONDecoder().decode(
      SharedUsernames.self, from: Data(contentsOf: Self.sharedUsernameCases))
  }

  @Test("a username is accepted as the cases shared with the account service say")
  func acceptedUsernames() throws {
    let accepted = try sharedUsernames().accepted
    #expect(!accepted.isEmpty)
    for expected in accepted {
      #expect(
        UserProfile.acceptedUsername(expected.typed) == expected.username, "\(expected.covers)")
    }
  }

  @Test("a username is refused as the cases shared with the account service say")
  func refusedUsernames() throws {
    let refused = try sharedUsernames().refused
    #expect(!refused.isEmpty)
    for expected in refused {
      #expect(UserProfile.acceptedUsername(expected.typed) == nil, "\(expected.covers)")
    }
  }

  @Test("a refused username is answered with the account service's own sentence")
  func usernameRule() throws {
    let shared = try sharedUsernames()
    #expect(UserProfile.usernameRule == shared.rule)
  }

  @Test("leaving the field saves what the rule accepts, clears on nothing, and refuses the rest")
  func usernameEdits() {
    #expect(UserProfile.usernameEdit("Kana_Fan", over: "") == .save("kana_fan"))
    #expect(UserProfile.usernameEdit("", over: "kana_fan") == .save(""))
    #expect(UserProfile.usernameEdit("   ", over: "kana_fan") == .save(""))
    #expect(UserProfile.usernameEdit("ab", over: "kana_fan") == .refuse)
    #expect(UserProfile.usernameEdit("kana.fa", over: "kana.fan") == .refuse)
  }

  @Test("a stored username the rule refuses is kept, not refused, when it is typed back as it was")
  func keepsARetypedUsername() {
    #expect(UserProfile.acceptedUsername("kana.fan") == nil)
    #expect(UserProfile.usernameEdit("kana.fan", over: "kana.fan") == .keep)
  }

  @MainActor
  @Test("a username an earlier version saved stays as it was until it is edited")
  func keepsAnEarlierUsername() throws {
    let defaults = MemoryDefaults()
    let photoURL = FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString).jpg")
    let earlier = UserProfile(defaults: defaults, photoURL: photoURL)
    earlier.edit(ProfileFields(username: "kana.fan"))
    #expect(UserProfile.acceptedUsername(earlier.username) == nil)

    let reloaded = UserProfile(defaults: defaults, photoURL: photoURL)
    #expect(reloaded.username == "kana.fan")
    var field = ProfileFieldEdit()
    field.show(reloaded.username)
    field.focus()
    #expect(field.unfocus() == nil)
    #expect(field.text == "kana.fan")
  }

  @MainActor
  @Test("an edit tells sync what changed and what it was, and a synced value doesn't")
  func editsReachSync() throws {
    let defaults = MemoryDefaults()
    let photoURL = FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString).jpg")
    let profile = UserProfile(defaults: defaults, photoURL: photoURL)
    var edits: [ProfileFields] = []
    var previous: [ProfileFields] = []
    profile.changeObserver = { change in
      guard case .profileEdited(let fields, let before) = change else { return }
      edits.append(fields)
      previous.append(before)
    }

    profile.applySynced(ProfileFields(name: "Kana Fan", username: "kana_fan"))
    profile.edit(ProfileFields(name: "Kana Fan"))
    profile.refusal = .usernameTaken
    profile.edit(ProfileFields(username: "kana"))
    profile.edit(ProfileFields(name: "", username: "kana.fan"))

    #expect(edits == [ProfileFields(username: "kana")])
    #expect(previous == [ProfileFields(username: "kana_fan")])
    #expect(profile.fields == ProfileFields(name: "", username: "kana.fan"))
    #expect(profile.refusal == nil)
    #expect(UserProfile(defaults: defaults, photoURL: photoURL).username == "kana.fan")
  }

  @Test("signed in, a name is 1 to 100 characters, as the account requires")
  func accountNames() {
    #expect(!UserProfile.isAccountName(""))
    #expect(UserProfile.isAccountName("A"))
    #expect(UserProfile.isAccountName(String(repeating: "あ", count: 100)))
    #expect(!UserProfile.isAccountName(String(repeating: "a", count: 101)))
    #expect(UserProfile.isAccountName(String(repeating: "e\u{301}", count: 100)))
    #expect(UserProfile.isAccountName("Kana " + String(repeating: " ", count: 100) + "Fan"))
    #expect(!UserProfile.isAccountName("👩\u{200D}💻 Kana"))
    #expect(!UserProfile.isAccountName("Ka\u{AD}na"))
    #expect(!UserProfile.isAccountName("Kana\u{85}Fan"))
  }

  @Test("the first sync keeps the account's non-empty fields and fills its empty ones")
  func firstSync() {
    let device = ProfileFields(name: "Phone Name", username: "phone_user")
    let full = FirstProfileSync(
      device: device, account: ProfileFields(name: "Devin", username: "devin"))
    #expect(full.onDevice == ProfileFields(name: "Devin", username: "devin"))
    #expect(full.uploads.isEmpty)

    let empty = FirstProfileSync(device: device, account: ProfileFields(name: "", username: ""))
    #expect(empty.onDevice == device)
    #expect(
      empty.uploads == [ProfileFields(name: "Phone Name"), ProfileFields(username: "phone_user")])

    let half = FirstProfileSync(
      device: ProfileFields(name: "", username: "phone_user"),
      account: ProfileFields(name: "Devin", username: ""))
    #expect(half.onDevice == ProfileFields(name: "Devin", username: "phone_user"))
    #expect(half.uploads.map(\.syncFields) == [["username": .string("phone_user")]])
    #expect(ProfileFields(username: "").syncFields == ["username": .null])

    let another = FirstProfileSync(
      device: device, account: ProfileFields(name: "", username: ""), fillsAccount: false)
    #expect(another.onDevice == ProfileFields(name: "", username: ""))
    #expect(another.uploads.isEmpty)
  }

  @Test("only what the account can take goes up: no empty name, and no username the rule refuses")
  func uploadableFields() {
    let earlier = FirstProfileSync(
      device: ProfileFields(name: "Kana", username: "kana.fan"),
      account: ProfileFields(name: "", username: ""))
    #expect(earlier.onDevice == ProfileFields(name: "Kana", username: "kana.fan"))
    #expect(earlier.uploads == [ProfileFields(name: "Kana")])
    #expect(ProfileFields(name: "", username: "").uploadable == ProfileFields(username: ""))
    #expect(ProfileFields(name: String(repeating: "a", count: 101)).uploadable.isEmpty)
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
  func persistence() {
    let defaults = MemoryDefaults()
    let photoURL = FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString).jpg")

    let profile = UserProfile(defaults: defaults, photoURL: photoURL)
    profile.edit(ProfileFields(name: "Devin Schumacher", username: "devin"))
    profile.email = "devin@serp.co"

    let reloaded = UserProfile(defaults: defaults, photoURL: photoURL)
    #expect(reloaded.name == "Devin Schumacher")
    #expect(reloaded.username == "devin")
    #expect(reloaded.email == "devin@serp.co")
    #expect(reloaded.initials == "DS")
  }

  @MainActor
  @Test("a profile that can't be read is kept aside, and new fields save")
  func keepsUnreadableProfileAside() throws {
    let defaults = MemoryDefaults()
    let unreadable = Data(#"{"name":"Devin"}"#.utf8)
    defaults.set(unreadable, forKey: "user-profile.v1")
    let photoURL = FileManager.default.temporaryDirectory.appending(path: "\(UUID().uuidString).jpg")

    let profile = UserProfile(defaults: defaults, photoURL: photoURL)
    #expect(profile.isEmpty)
    #expect(defaults.keptCopies(of: "user-profile.v1") == [unreadable])
    profile.edit(ProfileFields(name: "Devin Schumacher"))
    let reloaded = UserProfile(defaults: defaults, photoURL: photoURL)
    #expect(reloaded.name == "Devin Schumacher")
  }

  @Test("a profile field saves only what was typed in it, and shows another window's change once left")
  func keepsAnotherWindowsEdit() {
    var mainWindow = ProfileFieldEdit()
    var settings = ProfileFieldEdit()
    mainWindow.show("Ana")
    settings.show("Ana")
    settings.focus()
    mainWindow.focus()
    mainWindow.text = "Ana Lee"

    #expect(mainWindow.unfocus() == "Ana Lee")
    mainWindow.show("Ana Lee")
    settings.show("Ana Lee")
    #expect(settings.text == "Ana")
    #expect(settings.unfocus() == nil)
    #expect(settings.text == "Ana Lee")
    #expect(settings.unfocus() == nil)
    settings.focus()
    settings.text = "Ana Lee M"
    #expect(settings.unfocus() == "Ana Lee M")
  }

  @Test("text typed into a field whose focus wasn't seen still saves")
  func savesTextTypedWithoutFocus() {
    var name = ProfileFieldEdit()
    name.show("Ana")
    name.text = "Ana Lee"
    #expect(name.unfocus() == "Ana Lee")
  }

  @Test("an email that isn't valid stays as typed until its field is focused again")
  func keepsARejectedEmail() {
    var email = ProfileFieldEdit()
    email.show("ana@example.com")
    email.focus()
    email.text = "ana@"
    #expect(email.unfocus() == "ana@")
    email.reject()
    email.show("ana@example.com")
    #expect(email.text == "ana@")

    email.focus()
    #expect(email.unfocus() == nil)
    #expect(email.text == "ana@example.com")
  }
}
