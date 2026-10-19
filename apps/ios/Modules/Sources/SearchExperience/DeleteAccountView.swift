import SwiftUI

struct DeleteAccountView: View {
  private enum Step: Equatable {
    case explain
    case signIn(methods: Set<String>)
    case deleted(appStoreSubscriptionContinues: Bool)
  }

  @Environment(ZenbuAccount.self) private var zenbuAccount
  @Environment(\.dismiss) private var dismiss
  let finished: () -> Void
  @State private var step = Step.explain
  @State private var confirms = false
  @State private var isWorking = false
  @State private var message: String?
  @State private var email = ""
  @State private var managesInAppStore = false

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
        case .deleted(let appStoreSubscriptionContinues):
          Section {
            Text("Your Zenbu account is deleted.")
              .font(.headline)
            Text(
              "You're signed out. Your known words, lists, watch history, translations, notes, and media are still on this \(ThisDevice.name), and Zenbu works as before."
            )
            .accessibilityIdentifier("delete-account.done-note")
          }
          if appStoreSubscriptionContinues {
            appStoreSubscription(
              "Your App Store subscription is still running, and Apple keeps billing for it until you cancel it."
            )
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
      .formStyle(.grouped)
      .disabled(isWorking)
      .overlay {
        if isWorking { ProgressView() }
      }
      .navigationTitle("Delete Account")
      .inlineNavigationTitle()
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          if isDeleted {
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
    .appStoreSubscriptionSettings(isPresented: $managesInAppStore)
    .sheetSize(onMac: AppWindow.sheetSize)
    .interactiveDismissDisabled(isDeleted)
    .onAppear { email = zenbuAccount.account?.email ?? "" }
  }

  @ViewBuilder
  private var explanation: some View {
    Section {
      Text(
        "Deleting your Zenbu account deletes it, the ways you sign in, and everything it synced, on every device and Zenbu app. It can't be undone."
      )
      Text(
        "This \(ThisDevice.name) keeps your known words, lists, watch history, translations, notes, and media, and Zenbu keeps working signed out."
      )
      .foregroundStyle(.secondary)
      if subscription?.running.contains(where: { $0.managedIn == .website }) == true {
        Text("Your subscription from zenbujapanese.com is canceled with the account.")
          .foregroundStyle(.secondary)
      }
    }
    if subscription?.renewsInTheAppStore == true {
      appStoreSubscription(
        "Deleting your account doesn't cancel your App Store subscription. Cancel it in the App Store first, or Apple keeps billing for it."
      )
    }
  }

  private var subscription: KnownSubscription? { zenbuAccount.subscription.current }

  private var isDeleted: Bool {
    if case .deleted = step { return true }
    return false
  }

  private func appStoreSubscription(_ note: LocalizedStringKey) -> some View {
    Section {
      Text(note)
        .accessibilityIdentifier("delete-account.app-store-subscription")
      Button("Manage in the App Store") { managesInAppStore = true }
        .accessibilityIdentifier("delete-account.manage-subscription")
    }
  }

  @ViewBuilder
  private func signIn(_ methods: Set<String>) -> some View {
    Section {
      if methods.contains(AccountSignInProvider.apple.rawValue), !zenbuAccount.offersApple {
        Text(AccountMessage.appleDeletionUnavailableInDevBuild)
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
        "Deleting needs a fresh sign-in, so no one else holding this \(ThisDevice.name) can delete your account."
      )
    }
  }

  private func askToSignIn() {
    run {
      step = .signIn(methods: try await zenbuAccount.signInMethods())
    }
  }

  private func deleteAccount(appleAuthorizationCode: String?) async throws {
    let continues = try await zenbuAccount.deleteAccount(
      appleAuthorizationCode: appleAuthorizationCode)
    step = .deleted(appStoreSubscriptionContinues: continues)
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
