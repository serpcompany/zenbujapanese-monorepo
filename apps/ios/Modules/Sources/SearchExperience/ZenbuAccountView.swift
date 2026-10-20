import SwiftUI

struct ZenbuAccountRow: View {
  @Environment(ZenbuAccount.self) private var zenbuAccount
  @State private var showsSignIn = false

  var body: some View {
    Group {
      if let account = zenbuAccount.account {
        NavigationLink(value: AccountRoute.zenbuAccount) {
          LabeledContent {
            Text(account.email)
              .lineLimit(1)
          } label: {
            SettingsRowLabel(
              "Zenbu Account", subtitle: signedInNote, systemImage: "arrow.triangle.2.circlepath",
              tint: .purple)
          }
        }
        .accessibilityIdentifier("account.zenbu-account")
      } else {
        Button {
          showsSignIn = true
        } label: {
          SettingsRowLabel(
            "Sign In to Sync", subtitle: signedOutNote,
            systemImage: "person.crop.circle.badge.checkmark", tint: .purple)
        }
        .foregroundStyle(.primary)
        .disabled(!zenbuAccount.sync.isLoaded || zenbuAccount.sync.isUnavailable)
        .accessibilityIdentifier("account.sign-in")
      }
    }
    .sheet(isPresented: $showsSignIn) {
      AccountSignInView()
    }
  }

  private var signedInNote: String? {
    zenbuAccount.syncNeedsSubscription
      ? SubscriptionText.syncWaitsShort(zenbuAccount.subscription.current) : nil
  }

  private var signedOutNote: String {
    zenbuAccount.sync.sessionEndedOnItsOwn
      ? String(localized: "You were signed out. Sign in again to keep syncing.")
      : String(localized: "Known words, lists, watch history, and bookmarks, on all your devices")
  }
}

struct ZenbuAccountView: View {
  @Environment(ZenbuAccount.self) private var zenbuAccount
  @Environment(\.dismiss) private var dismiss
  @State private var confirmsSignOut = false
  @State private var deletes = false
  @State private var showsPaywall = false
  @State private var managesInAppStore = false

  var body: some View {
    Form {
      if let account = zenbuAccount.account {
        Section {
          LabeledContent("Email", value: account.email)
            .accessibilityIdentifier("zenbu-account.email")
        }
        SubscriptionSection(showsPaywall: $showsPaywall, managesInAppStore: $managesInAppStore)
        syncSection
        Section {
          Button("Sign Out") { confirmsSignOut = true }
            .accessibilityIdentifier("zenbu-account.sign-out")
        } footer: {
          Text("Signing out keeps your profile, known words, lists, watch history, translations, notes, and media on this \(ThisDevice.name).")
        }
        Section {
          Button("Delete Account…", role: .destructive) { deletes = true }
            .accessibilityIdentifier("zenbu-account.delete")
        }
      } else {
        Section {
          Text("You're signed out. Everything stays on this \(ThisDevice.name).")
        }
      }
    }
    .formStyle(.grouped)
    .navigationTitle("Zenbu Account")
    .task { await zenbuAccount.subscription.refresh() }
    .confirmationDialog(
      "Sign out of Zenbu?", isPresented: $confirmsSignOut, titleVisibility: .visible
    ) {
      Button("Sign Out") {
        Task {
          await zenbuAccount.signOut()
          dismiss()
        }
      }
    } message: {
      Text(
        "Your known words, lists, notes, photos, watch history, and translations stay on this \(ThisDevice.name). Changes you make while signed out sync when you sign in to this account again."
      )
    }
    .sheet(isPresented: $deletes) {
      DeleteAccountView { dismiss() }
    }
    .sheet(isPresented: $showsPaywall) { SubscriptionPaywall() }
    .appStoreSubscriptionSettings(isPresented: $managesInAppStore)
  }

  private var syncSection: some View {
    Section {
      LabeledContent("Last Synced") {
        if zenbuAccount.sync.isSyncing {
          ProgressView()
        } else if let lastSyncedAt = zenbuAccount.sync.lastSyncedAt {
          Text(lastSyncedAt, format: .relative(presentation: .named))
        } else {
          Text("Not Yet")
        }
      }
      .accessibilityIdentifier("zenbu-account.last-synced")
      if zenbuAccount.sync.queuedChangeCount > 0 {
        LabeledContent("Waiting to Sync") {
          Text(zenbuAccount.sync.queuedChangeCount, format: .number)
        }
      }
      if zenbuAccount.sync.photosUnavailable {
        Text(AccountMessage.photosWaitForStorage)
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("zenbu-account.photos-wait")
      }
      ForEach(AccountMessage.refusedPhotos(zenbuAccount.sync.state.refusedPhotos), id: \.self) {
        Text($0)
          .foregroundStyle(.secondary)
      }
      if let problem = zenbuAccount.sync.bookmarksProblem {
        Text(AccountMessage.syncPaused(by: problem))
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("zenbu-account.bookmarks-unreadable")
      } else if zenbuAccount.syncNeedsSubscription {
        Text(SubscriptionText.syncWaits(zenbuAccount.subscription.current, on: ThisDevice.name))
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("zenbu-account.sync-waits")
      } else if let failure = zenbuAccount.sync.lastFailure,
        let message = AccountMessage.text(for: failure)
      {
        Text(message)
          .foregroundStyle(.secondary)
      }
      Button("Sync Now") {
        Task { await zenbuAccount.syncNowAsked() }
      }
      .disabled(zenbuAccount.sync.isSyncing || zenbuAccount.sync.waitsForUnreadableBookmarks)
      .accessibilityIdentifier("zenbu-account.sync-now")
    } footer: {
      Text(
        "Zenbu syncs your profile, known words, lists, notes, photos, settings, recent lookups, watch history, and bookmarked translations after each change and when it opens. They also stay on this \(ThisDevice.name), and work offline."
      )
    }
  }
}
