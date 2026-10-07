import SwiftUI

struct AccountSignInView: View {
  @Environment(ZenbuAccount.self) private var zenbuAccount
  @Environment(\.dismiss) private var dismiss
  @State private var email = ""
  @State private var isWorking = false
  @State private var message: String?

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Text(
            "Sign in to sync your known words and lists across your devices and Zenbu apps. Everything also stays on this iPhone, and Zenbu works the same signed out."
          )
          .foregroundStyle(.secondary)
          .listRowBackground(Color.clear)
          .listRowInsets(EdgeInsets(top: 4, leading: 4, bottom: 4, trailing: 4))
        }

        Section {
          if zenbuAccount.offersApple {
            AppleSignInButton(type: .signIn) {
              run { try await zenbuAccount.signInWithApple() }
            }
            .frame(height: 50)
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
          } else {
            Text(AccountMessage.appleUnavailableInDevBuild)
              .foregroundStyle(.secondary)
              .accessibilityIdentifier("account.sign-in.apple-unavailable")
          }
          if zenbuAccount.offersGoogle {
            GoogleSignInButton {
              run { try await zenbuAccount.signInWithGoogle() }
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
          }
        }

        Section {
          EmailCodeForm(
            email: $email, emailIsFixed: false, submitTitle: "Sign In", run: run,
            send: { try await zenbuAccount.sendEmailCode(to: $0) },
            verify: { try await zenbuAccount.signIn(email: $0, code: $1) })
        } header: {
          Text("Or use an emailed code")
        }

        if let message {
          Section {
            Text(message)
              .foregroundStyle(.red)
              .accessibilityIdentifier("account.sign-in.message")
          }
        }
      }
      .disabled(isWorking)
      .overlay {
        if isWorking { ProgressView() }
      }
      .navigationTitle("Sign In to Zenbu")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
        }
      }
    }
  }

  private func run(_ work: @escaping () async throws -> Void) {
    isWorking = true
    message = nil
    Task {
      defer { isWorking = false }
      do {
        try await work()
        if zenbuAccount.account != nil { dismiss() }
      } catch {
        message = AccountMessage.text(for: error)
      }
    }
  }
}
