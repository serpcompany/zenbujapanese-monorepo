import AuthenticationServices
import SwiftUI

enum AccountMessage {
  static let appleUnavailableInDevBuild = String(
    localized:
      "Sign in with Apple isn't available in this development build. Use an emailed code, or the App Store or TestFlight app."
  )

  static let appleDeletionUnavailableInDevBuild = String(
    localized:
      "This account signs in with Apple, and deleting it needs Sign in with Apple, which this development build doesn't have. Delete it from the App Store or TestFlight app."
  )

  static func text(for error: Error) -> String? {
    if error is CancellationError { return nil }
    if case GoogleSignInError.refused(let reason) = error, reason == "not_configured" {
      return String(localized: "Google sign-in isn't set up in this build.")
    }
    guard let error = error as? AccountServiceError else {
      return String(localized: "Sign-in didn't finish. Try again.")
    }
    switch error {
    case .unreachable:
      return String(localized: "Couldn't reach Zenbu. Check your connection and try again.")
    case .sessionEnded:
      return String(localized: "You were signed out. Sign in again to keep syncing.")
    case .differentAccount:
      return String(
        localized: "That's a different Zenbu account. Sign in to the account you're deleting.")
    case .missingSessionToken, .unreadableAnswer:
      return String(
        localized: "Zenbu answered in a way this version doesn't understand. Try again later.")
    case .refused(let status, let code, _, _):
      return text(forCode: code)
        ?? (status >= 500
          ? String(localized: "Zenbu couldn't do that right now. Try again later.")
          : String(localized: "Zenbu couldn't do that. Try again."))
    }
  }

  private static func text(forCode code: String) -> String? {
    switch code {
    case "invalid_otp": String(localized: "That code isn't right. Check it and try again.")
    case "otp_expired": String(localized: "That code has expired. Ask for a new one.")
    case "too_many_attempts": String(localized: "Too many tries. Ask for a new code.")
    case "too_many_requests": String(localized: "Too many tries. Wait a few minutes and try again.")
    case "account_not_linked":
      String(localized: "This email's account signs in with Apple or Google. Sign in that way.")
    case "oauth_link_error":
      String(
        localized:
          "This email already has a Zenbu account that signs in another way. Sign in that way.")
    case "email_not_verified":
      String(localized: "That account's email isn't verified, so Zenbu can't use it.")
    case "unknown_client", "client_mismatch":
      String(localized: "This version of Zenbu can't sign in. Update the app.")
    case "email_unavailable":
      String(localized: "Zenbu can't send email codes right now. Try again later.")
    case "sign_in_again": String(localized: "Sign in again to delete your account.")
    case "apple_authorization_needed", "apple_authorization_invalid":
      String(localized: "Nothing was deleted. Sign in with Apple again to delete your account.")
    case "apple_account_mismatch":
      String(localized: "Nothing was deleted. Sign in with the Apple ID this account uses.")
    case "apple_unavailable":
      String(
        localized:
          "Apple didn't finish, so nothing was deleted. Sign in with Apple again to try again.")
    default: nil
    }
  }
}

struct AppleSignInButton: UIViewRepresentable {
  @Environment(\.colorScheme) private var colorScheme
  let type: ASAuthorizationAppleIDButton.ButtonType
  let action: () -> Void

  func makeCoordinator() -> Coordinator { Coordinator() }

  func makeUIView(context: Context) -> UIView {
    UIView()
  }

  func updateUIView(_ container: UIView, context: Context) {
    let style: ASAuthorizationAppleIDButton.Style = colorScheme == .dark ? .white : .black
    context.coordinator.action = action
    guard context.coordinator.style != style else { return }
    context.coordinator.style = style
    container.subviews.forEach { $0.removeFromSuperview() }
    let button = ASAuthorizationAppleIDButton(
      authorizationButtonType: type, authorizationButtonStyle: style)
    button.cornerRadius = 10
    button.translatesAutoresizingMaskIntoConstraints = false
    button.addTarget(
      context.coordinator, action: #selector(Coordinator.tapped), for: .touchUpInside)
    button.accessibilityIdentifier = "account.sign-in.apple"
    container.addSubview(button)
    NSLayoutConstraint.activate([
      button.leadingAnchor.constraint(equalTo: container.leadingAnchor),
      button.trailingAnchor.constraint(equalTo: container.trailingAnchor),
      button.topAnchor.constraint(equalTo: container.topAnchor),
      button.bottomAnchor.constraint(equalTo: container.bottomAnchor),
    ])
  }

  @MainActor
  final class Coordinator: NSObject {
    var action: () -> Void = {}
    var style: ASAuthorizationAppleIDButton.Style?

    @objc func tapped() { action() }
  }
}

struct GoogleSignInButton: View {
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text("Sign in with Google")
        .font(.body.weight(.semibold))
        .frame(maxWidth: .infinity, minHeight: 50)
    }
    .buttonStyle(.bordered)
    .buttonBorderShape(.roundedRectangle(radius: 10))
    .accessibilityIdentifier("account.sign-in.google")
  }
}

struct EmailCodeForm: View {
  @Binding var email: String
  let emailIsFixed: Bool
  let submitTitle: LocalizedStringKey
  let run: (@escaping () async throws -> Void) -> Void
  let send: (String) async throws -> Void
  let verify: (String, String) async throws -> Void
  @State private var code = ""
  @State private var codeSentTo: String?

  var body: some View {
    TextField("Email", text: $email)
      .textContentType(.emailAddress)
      .keyboardType(.emailAddress)
      .textInputAutocapitalization(.never)
      .autocorrectionDisabled()
      .disabled(emailIsFixed)
      .accessibilityIdentifier("account.email")
    Button(codeSentTo == nil ? "Email Me a Code" : "Send a New Code") {
      let address = email
      run {
        try await send(address)
        codeSentTo = address
      }
    }
    .disabled(!email.contains("@"))
    .accessibilityIdentifier("account.send-code")
    if let codeSentTo {
      TextField("6-digit code", text: $code)
        .textContentType(.oneTimeCode)
        .keyboardType(.numberPad)
        .accessibilityIdentifier("account.code")
      Button(submitTitle) {
        let entered = code
        run { try await verify(codeSentTo, entered) }
      }
      .disabled(code.trimmingCharacters(in: .whitespaces).count < 6)
      .accessibilityIdentifier("account.verify-code")
    }
  }
}
