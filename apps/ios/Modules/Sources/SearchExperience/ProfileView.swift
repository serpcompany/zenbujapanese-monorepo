import PhotosUI
import SwiftUI

struct ProfileAvatar: View {
  let profile: UserProfile
  let size: CGFloat

  var body: some View {
    Group {
      if let photo = profile.photo {
        Image(decorative: photo, scale: 1)
          .resizable()
          .scaledToFill()
      } else if !profile.initials.isEmpty {
        Text(profile.initials)
          .font(.system(size: size * 0.38, weight: .medium, design: .rounded))
          .foregroundStyle(.white)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(Color.gray.gradient)
      } else {
        Image(systemName: "person.crop.circle.fill")
          .resizable()
          .scaledToFit()
          .foregroundStyle(.gray)
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .accessibilityHidden(true)
  }
}

struct ProfileCardRow: View {
  @Environment(UserProfile.self) private var profile

  var body: some View {
    HStack(spacing: 14) {
      ProfileAvatar(profile: profile, size: 56)
      VStack(alignment: .leading, spacing: 2) {
        Text(profile.name.isEmpty ? "Set Up Your Profile" : profile.name)
          .font(.title3.weight(.semibold))
          .foregroundStyle(.primary)
        Text(subtitle)
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.vertical, 4)
  }

  private var subtitle: String {
    profile.username.isEmpty ? "Name, username, photo, and email" : "@\(profile.username)"
  }
}

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
}

struct ProfileView: View {
  private enum Field: Hashable {
    case name
    case username
    case email
  }

  @Environment(UserProfile.self) private var profile
  @State private var photoSelection: PhotosPickerItem?
  @State private var name = ProfileFieldEdit()
  @State private var username = ProfileFieldEdit()
  @State private var email = ProfileFieldEdit()
  @State private var showsEmailError = false
  @FocusState private var focusedField: Field?

  var body: some View {
    Form {
      Section {
        VStack(spacing: 12) {
          ProfileAvatar(profile: profile, size: 120)
          photoMenu
        }
        .frame(maxWidth: .infinity)
        .listRowBackground(Color.clear)
      }

      Section {
        LabeledContent("Name") {
          TextField("Name", text: $name.text, prompt: Text("Your Name"))
            .textContentType(.name)
            .textEntry(.capitalizedWords)
            .focused($focusedField, equals: .name)
            .multilineTextAlignment(.trailing)
            .labelsHidden()
            .accessibilityIdentifier("profile.name")
        }
        LabeledContent("Username") {
          TextField("Username", text: $username.text, prompt: Text("username"))
            .textContentType(.username)
            .textEntry(.uncapitalized)
            .autocorrectionDisabled()
            .focused($focusedField, equals: .username)
            .multilineTextAlignment(.trailing)
            .labelsHidden()
            .accessibilityIdentifier("profile.username")
        }
        LabeledContent("Email") {
          TextField("Email", text: $email.text, prompt: Text(verbatim: "name@example.com"))
            .textContentType(.emailAddress)
            .textEntry(.email)
            .autocorrectionDisabled()
            .focused($focusedField, equals: .email)
            .onChange(of: email.text) { showsEmailError = false }
            .multilineTextAlignment(.trailing)
            .labelsHidden()
            .accessibilityIdentifier("profile.email")
        }
      } footer: {
        if showsEmailError {
          Text(verbatim: "Enter a valid email address, like name@example.com.")
            .foregroundStyle(.red)
        } else {
          Text("Usernames use letters a–z, numbers, underscores, and periods. Your profile is stored only on this device.")
        }
      }
      .submitLabel(.done)
      .onSubmit { focusedField = nil }
    }
    .formStyle(.grouped)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("profile.form")
    .navigationTitle("Profile")
    .inlineNavigationTitle()
    .onAppear(perform: showSaved)
    .onChange(of: [profile.name, profile.username, profile.email], showSaved)
    .onChange(of: focusedField) { previous, current in
      if let previous { commit(previous) }
      switch current {
      case .name: name.focus()
      case .username: username.focus()
      case .email: email.focus()
      case nil: break
      }
    }
    .onDisappear {
      if let focusedField { commit(focusedField) }
    }
    .onChange(of: photoSelection) { _, item in
      guard let item else { return }
      Task {
        if let data = try? await item.loadTransferable(type: Data.self) {
          await profile.setPhoto(data)
        }
        photoSelection = nil
      }
    }
  }

  @ViewBuilder
  private var photoMenu: some View {
    if profile.photo == nil {
      PhotosPicker("Add Photo", selection: $photoSelection, matching: .images)
        .buttonStyle(.bordered)
        .buttonBorderShape(.capsule)
        .accessibilityIdentifier("profile.change-photo")
    } else {
      Menu("Change") {
        PhotosPicker("Choose Photo", selection: $photoSelection, matching: .images)
        Button("Remove Photo", role: .destructive) { profile.removePhoto() }
      }
      .buttonStyle(.bordered)
      .buttonBorderShape(.capsule)
      .accessibilityIdentifier("profile.change-photo")
    }
  }

  private func showSaved() {
    name.show(profile.name)
    username.show(profile.username)
    email.show(profile.email)
  }

  private func commit(_ field: Field) {
    switch field {
    case .name:
      if let edited = name.unfocus() {
        profile.name = edited.trimmingCharacters(in: .whitespacesAndNewlines)
      }
      name.show(profile.name)
    case .username:
      if let edited = username.unfocus() {
        profile.username = UserProfile.normalizedUsername(edited)
      }
      username.show(profile.username)
    case .email:
      if let edited = email.unfocus() {
        let trimmed = edited.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty || UserProfile.isValidEmail(trimmed) else {
          email.reject()
          showsEmailError = true
          return
        }
        profile.email = trimmed
      }
      email.show(profile.email)
    }
  }
}
