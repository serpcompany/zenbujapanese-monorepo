import PhotosUI
import SwiftUI

struct ProfileAvatar: View {
  let profile: UserProfile
  let size: CGFloat

  var body: some View {
    Group {
      if let photo = profile.photo {
        Image(uiImage: photo)
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
  private enum Field: Hashable {
    case name
    case username
    case email
  }

  @Environment(UserProfile.self) private var profile
  @State private var photoSelection: PhotosPickerItem?
  @State private var name = ""
  @State private var username = ""
  @State private var email = ""
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
          TextField("Name", text: $name, prompt: Text("Your Name"))
            .textContentType(.name)
            .textInputAutocapitalization(.words)
            .focused($focusedField, equals: .name)
            .multilineTextAlignment(.trailing)
            .accessibilityIdentifier("profile.name")
        }
        LabeledContent("Username") {
          TextField("Username", text: $username, prompt: Text("username"))
            .textContentType(.username)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .focused($focusedField, equals: .username)
            .multilineTextAlignment(.trailing)
            .accessibilityIdentifier("profile.username")
        }
        LabeledContent("Email") {
          TextField("Email", text: $email, prompt: Text(verbatim: "name@example.com"))
            .textContentType(.emailAddress)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .focused($focusedField, equals: .email)
            .onChange(of: email) { showsEmailError = false }
            .multilineTextAlignment(.trailing)
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
    .accessibilityIdentifier("profile.form")
    .navigationTitle("Profile")
    .navigationBarTitleDisplayMode(.inline)
    .onAppear {
      name = profile.name
      username = profile.username
      email = profile.email
    }
    .onChange(of: focusedField) { previous, _ in
      if let previous { commit(previous) }
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

  private func commit(_ field: Field) {
    switch field {
    case .name:
      name = name.trimmingCharacters(in: .whitespacesAndNewlines)
      profile.name = name
    case .username:
      username = UserProfile.normalizedUsername(username)
      profile.username = username
    case .email:
      email = email.trimmingCharacters(in: .whitespacesAndNewlines)
      guard email.isEmpty || UserProfile.isValidEmail(email) else {
        showsEmailError = true
        return
      }
      profile.email = email
    }
  }
}
