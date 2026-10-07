import SwiftUI

struct DeleteAccountView: View {
  private enum Step: Equatable {
    case explain
    case signIn(methods: Set<String>)
    case deleted
  }

  @Environment(ZenbuAccount.self) private var zenbuAccount
  @Environment(\.dismiss) private var dismiss
  let finished: () -> Void
  @State private var step = Step.explain
  @State private var confirms = false
  @State private var isWorking = false
  @State private var message: String?
  @State private var email = ""

  var body: some View {
    NavigationStack {
      Form {
        switch step {
        case .explain:
          explanation
          Section {
            Button("Delete Account…", role: .destructive) { confirms = true }
              .accessibilityIdentifier("delete-account.start")
          }
        case .signIn(let methods):
          signIn(methods)
        case .deleted:
          Section {
            Text("Your Zenbu account is deleted.")
              .font(.headline)
            Text(
              "You're signed out. Your known words, lists, watch history, notes, and media are still on this iPhone, and Zenbu works as before."
            )
            .accessibilityIdentifier("delete-account.done-note")
          }
        }
        if let message {
          Section {
            Text(message)
              .foregroundStyle(.red)
              .accessibilityIdentifier("delete-account.message")
          }
        }
      }
      .disabled(isWorking)
      .overlay {
        if isWorking { ProgressView() }
      }
      .navigationTitle("Delete Account")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          if step == .deleted {
            Button("Done") { finish() }
              .accessibilityIdentifier("delete-account.done")
          } else {
            Button("Cancel") { dismiss() }
          }
        }
      }
      .confirmationDialog(
        "Delete your Zenbu account?", isPresented: $confirms, titleVisibility: .visible
      ) {
        Button("Delete Account", role: .destructive) { askToSignIn() }
          .accessibilityIdentifier("delete-account.confirm")
      } message: {
        Text("This deletes the account and everything it synced. It can't be undone.")
      }
    }
    .interactiveDismissDisabled(step == .deleted)
    .onAppear { email = zenbuAccount.account?.email ?? "" }
  }

  private var explanation: some View {
    Section {
      Text(
        "Deleting your Zenbu account deletes it, the ways you sign in, and everything it synced, on every device and Zenbu app. It can't be undone."
      )
      Text(
        "This iPhone keeps your known words, lists, watch history, notes, and media, and Zenbu keeps working signed out."
      )
      .foregroundStyle(.secondary)
    }
  }

  @ViewBuilder
  private func signIn(_ methods: Set<String>) -> some View {
    Section {
      if methods.contains(AccountSignInProvider.apple.rawValue), !zenbuAccount.offersApple {
        Text(AccountMessage.appleUnavailableInDevBuild)
          .foregroundStyle(.secondary)
      } else if methods.contains(AccountSignInProvider.apple.rawValue) {
        AppleSignInButton(type: .continue) {
          run {
            let code = try await zenbuAccount.confirmIdentityWithApple()
            try await deleteAccount(appleAuthorizationCode: code)
          }
        }
        .frame(height: 50)
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
      } else {
        if methods.contains(AccountSignInProvider.google.rawValue), zenbuAccount.offersGoogle {
          GoogleSignInButton {
            run {
              try await zenbuAccount.confirmIdentityWithGoogle()
              try await deleteAccount(appleAuthorizationCode: nil)
            }
          }
          .listRowInsets(EdgeInsets())
          .listRowBackground(Color.clear)
        }
        if methods.contains("email") {
          EmailCodeForm(
            email: $email, emailIsFixed: true, submitTitle: "Delete Account", run: run,
            send: { try await zenbuAccount.sendEmailCode(to: $0) },
            verify: { address, code in
              try await zenbuAccount.confirmIdentity(email: address, code: code)
              try await deleteAccount(appleAuthorizationCode: nil)
            })
        } else if !zenbuAccount.offersGoogle {
          Text("This account signs in only with Google, which this build of Zenbu can't use.")
        }
      }
    } header: {
      Text("Sign in again to delete")
    } footer: {
      Text(
        "Deleting needs a fresh sign-in, so no one else holding this iPhone can delete your account."
      )
    }
  }

  private func askToSignIn() {
    run {
      step = .signIn(methods: try await zenbuAccount.signInMethods())
    }
  }

  private func deleteAccount(appleAuthorizationCode: String?) async throws {
    try await zenbuAccount.deleteAccount(appleAuthorizationCode: appleAuthorizationCode)
    step = .deleted
  }

  private func finish() {
    dismiss()
    finished()
  }

  private func run(_ work: @escaping () async throws -> Void) {
    isWorking = true
    message = nil
    Task {
      defer { isWorking = false }
      do {
        try await work()
      } catch AccountServiceError.sessionEnded {
        message = AccountMessage.text(for: AccountServiceError.sessionEnded)
        finish()
      } catch {
        message = AccountMessage.text(for: error)
      }
    }
  }
}
