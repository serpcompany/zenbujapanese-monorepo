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

struct ProfileView: View {
  private typealias Field = ProfileEditing.Field

  @Environment(UserProfile.self) private var profile
  @Environment(ZenbuAccount.self) private var zenbuAccount: ZenbuAccount?
  @State private var photoSelection: PhotosPickerItem?
  @State private var editing = ProfileEditing()
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
          TextField("Name", text: $editing.name.text, prompt: Text("Your Name"))
            .textContentType(.name)
            .textEntry(.capitalizedWords)
            .focused($focusedField, equals: .name)
            .multilineTextAlignment(.trailing)
            .labelsHidden()
            .accessibilityIdentifier("profile.name")
        }
        LabeledContent("Username") {
          TextField("Username", text: $editing.username.text, prompt: Text("username"))
            .textContentType(.username)
            .textEntry(.uncapitalized)
            .autocorrectionDisabled()
            .focused($focusedField, equals: .username)
            .onChange(of: editing.username.text) { editing.showsUsernameError = false }
            .multilineTextAlignment(.trailing)
            .labelsHidden()
            .accessibilityIdentifier("profile.username")
        }
        LabeledContent("Email") {
          if let accountEmail {
            Text(verbatim: accountEmail)
              .foregroundStyle(.secondary)
              .lineLimit(1)
              .truncationMode(.middle)
              .textSelection(.enabled)
              .accessibilityIdentifier("profile.account-email")
          } else {
            TextField(
              "Email", text: $editing.email.text, prompt: Text(verbatim: "name@example.com"))
              .textContentType(.emailAddress)
              .textEntry(.email)
              .autocorrectionDisabled()
              .focused($focusedField, equals: .email)
              .onChange(of: editing.email.text) { editing.showsEmailError = false }
              .multilineTextAlignment(.trailing)
              .labelsHidden()
              .accessibilityIdentifier("profile.email")
          }
        }
      } footer: {
        if footerErrors.isEmpty {
          Text(verbatim: "\(UserProfile.usernameRule) \(storageNote)")
        } else {
          VStack(alignment: .leading, spacing: 4) {
            ForEach(footerErrors, id: \.self) { Text(verbatim: $0) }
          }
          .foregroundStyle(.red)
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
    .onAppear {
      editing.profile = profile
      editing.accountEmail = accountEmail
      editing.showSaved()
    }
    .onChange(of: accountEmail) { editing.accountEmail = accountEmail }
    .onChange(of: [profile.name, profile.username, profile.email]) { editing.showSaved() }
    .onChange(of: focusedField) { previous, current in
      editing.focusMoved(from: previous, to: current)
    }
    .onDisappear { editing.leave() }
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

  private var accountEmail: String? { zenbuAccount?.account?.email }

  private var storageNote: String {
    accountEmail == nil
      ? "Your profile is stored only on this device."
      : "Your name, username, and photo sync with your Zenbu account."
  }

  private var footerErrors: [String] {
    let errors = [
      editing.showsNameError ? UserProfile.accountNameRule : nil,
      editing.showsUsernameError ? UserProfile.usernameRule : nil,
      editing.showsEmailError ? "Enter a valid email address, like name@example.com." : nil,
      profile.refusal.map(Self.message),
    ]
    return errors.compactMap { $0 }.reduce(into: []) { shown, error in
      if !shown.contains(error) { shown.append(error) }
    }
  }

  private static func message(for refusal: ProfileRefusal) -> String {
    switch refusal {
    case .usernameTaken: "That username is taken. Choose another."
    case .other: "Your Zenbu account didn't take that change, so it went back."
    }
  }
}
