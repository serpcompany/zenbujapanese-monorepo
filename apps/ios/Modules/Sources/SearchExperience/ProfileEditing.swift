import Observation

struct ProfileFieldEdit: Equatable {
  var text = ""
  private var saved = ""
  private var textWhenFocused: String?
  private var keepsRejectedText = false

  mutating func focus() {
    textWhenFocused = text
    keepsRejectedText = false
  }

  mutating func show(_ saved: String) {
    self.saved = saved
    guard textWhenFocused == nil, !keepsRejectedText else { return }
    text = saved
  }

  mutating func unfocus() -> String? {
    guard let textWhenFocused else { return text == saved ? nil : text }
    self.textWhenFocused = nil
    guard text == textWhenFocused else { return text }
    text = saved
    return nil
  }

  mutating func reject() {
    keepsRejectedText = true
  }

  var typedSinceFocus: String? {
    guard let textWhenFocused, text != textWhenFocused else { return nil }
    return text
  }

  mutating func keptAsTyped() {
    textWhenFocused = text
  }
}

@MainActor
@Observable
final class ProfileEditing: TypedDraft {
  enum Field: Hashable {
    case name
    case username
    case email
  }

  var name = ProfileFieldEdit()
  var username = ProfileFieldEdit()
  var email = ProfileFieldEdit()
  var showsNameError = false
  var showsUsernameError = false
  var showsEmailError = false
  @ObservationIgnored var profile: UserProfile?
  @ObservationIgnored var accountEmail: String?
  @ObservationIgnored private var focused: Field?

  init(drafts: TypedDrafts = .shared) {
    drafts.hold(self)
  }

  func showSaved() {
    guard let profile else { return }
    name.show(profile.name)
    username.show(profile.username)
    email.show(profile.email)
  }

  func focusMoved(from previous: Field?, to current: Field?) {
    if let previous { commit(previous) }
    focused = current
    switch current {
    case .name:
      name.focus()
      showsNameError = false
    case .username: username.focus()
    case .email: email.focus()
    case nil: break
    }
  }

  func leave() {
    if let focused { commit(focused) }
  }

  func keepDraft() async {
    guard let profile, let focused else { return }
    switch focused {
    case .name:
      guard let typed = name.typedSinceFocus, let accepted = acceptedName(typed) else { return }
      profile.edit(ProfileFields(name: accepted))
      name.keptAsTyped()
    case .username:
      guard let typed = username.typedSinceFocus,
        case .save(let accepted) = UserProfile.usernameEdit(typed, over: profile.username)
      else { return }
      profile.edit(ProfileFields(username: accepted))
      username.keptAsTyped()
    case .email:
      guard let typed = email.typedSinceFocus, let accepted = acceptedEmail(typed) else { return }
      profile.email = accepted
      email.keptAsTyped()
    }
  }

  private func acceptedName(_ typed: String) -> String? {
    accountEmail == nil
      ? typed.trimmingCharacters(in: .whitespacesAndNewlines) : AccountRules.shared.name(typed)
  }

  private func acceptedEmail(_ typed: String) -> String? {
    let trimmed = typed.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty || UserProfile.isValidEmail(trimmed) ? trimmed : nil
  }

  private func commit(_ field: Field) {
    guard let profile else { return }
    switch field {
    case .name:
      if let edited = name.unfocus() {
        if let accepted = acceptedName(edited) {
          profile.edit(ProfileFields(name: accepted))
        } else {
          showsNameError = true
        }
      }
      name.show(profile.name)
    case .username:
      if let edited = username.unfocus() {
        switch UserProfile.usernameEdit(edited, over: profile.username) {
        case .keep:
          break
        case .save(let accepted):
          profile.edit(ProfileFields(username: accepted))
        case .refuse:
          username.reject()
          showsUsernameError = true
          return
        }
      }
      username.show(profile.username)
    case .email:
      if let edited = email.unfocus() {
        guard let accepted = acceptedEmail(edited) else {
          email.reject()
          showsEmailError = true
          return
        }
        profile.email = accepted
      }
      email.show(profile.email)
    }
  }
}
