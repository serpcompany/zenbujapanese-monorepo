import SwiftUI

struct ReportAProblemButton: View {
  @Environment(ZenbuAccount.self) private var zenbuAccount: ZenbuAccount?
  @State private var reportsProblem = false

  var body: some View {
    Button {
      reportsProblem = true
    } label: {
      SettingsRowLabel(
        "Report a Problem…", systemImage: "exclamationmark.bubble.fill", tint: .pink)
    }
    .foregroundStyle(.primary)
    .accessibilityIdentifier("account.report-a-problem")
    .sheet(isPresented: $reportsProblem) {
      ProblemReportView(
        accountEmail: zenbuAccount?.account?.email,
        sender: LaunchHarness.problemReportSender ?? .live)
    }
  }
}

struct ProblemReportView: View {
  static let signedInNote: LocalizedStringKey =
    "Your report goes to the Zenbu Japanese developers through Sentry. File paths, links, and email addresses are removed from what you write, and the rest is sent as written. Your Zenbu account's email is filled in and sent so you can get a reply. Clear it if you don't want one."
  static let signedOutNote: LocalizedStringKey =
    "Your report goes to the Zenbu Japanese developers through Sentry. File paths, links, and email addresses are removed from what you write, and the rest is sent as written. Enter your email if you'd like a reply."
  static let cannotSendNote: LocalizedStringKey =
    "This build of Zenbu Japanese can't send reports. Email [support@zenbujapanese.com](mailto:support@zenbujapanese.com) instead."
  static let alsoAdded: LocalizedStringKey =
    "Sentry also adds technical details about this \(ThisDevice.name)'s state, such as memory in use and Low Power Mode. No conversations, searches, lists, or photos are attached."

  @Environment(\.dismiss) private var dismiss
  @State private var form: ProblemReportForm
  @State private var confirmsDiscard = false
  private let isSignedIn: Bool

  init(accountEmail: String?, sender: ProblemReportSender) {
    _form = State(initialValue: ProblemReportForm(accountEmail: accountEmail, sender: sender))
    isSignedIn = accountEmail != nil
  }

  var body: some View {
    NavigationStack {
      Group {
        if form.phase == .sent {
          ContentUnavailableView(
            "Report Sent", systemImage: "checkmark.circle.fill",
            description: Text("Thanks. Your report is on its way."))
        } else {
          fields
        }
      }
      .navigationTitle("Report a Problem")
      .inlineNavigationTitle()
      .toolbar { toolbar }
    }
    .sheetSize(onMac: AppWindow.sheetSize)
    .interactiveDismissDisabled(form.phase == .sending || (form.phase == .editing && form.hasTypedText))
    .task {
      form.show(await ProblemReportDetails.current(isSignedIn: isSignedIn))
    }
  }

  private var fields: some View {
    Form {
      Section("What happened?") {
        TextField("Describe the problem", text: $form.description, axis: .vertical)
          .lineLimit(4...)
          .accessibilityIdentifier("problem-report.description")
      }
      Section {
        TextField("Your email (optional, for a reply)", text: $form.email)
          .textContentType(.emailAddress)
          .textEntry(.email)
          .autocorrectionDisabled()
          .accessibilityIdentifier("problem-report.email")
      } footer: {
        VStack(alignment: .leading, spacing: 8) {
          if !form.emailIsValid {
            Text("Enter an email address, or leave this empty.")
              .foregroundStyle(.red)
              .accessibilityIdentifier("problem-report.invalid-email")
          }
          Text(note)
            .accessibilityIdentifier("problem-report.note")
        }
      }
      Section {
        if let details = form.details {
          ForEach(details.lines) { line in
            LabeledContent(line.label, value: line.value)
          }
        } else {
          ProgressView()
        }
      } header: {
        Text("Included with your report")
      } footer: {
        Text(Self.alsoAdded)
      }
    }
    .formStyle(.grouped)
    .disabled(form.phase == .sending)
  }

  @ToolbarContentBuilder
  private var toolbar: some ToolbarContent {
    if form.phase == .sent {
      ToolbarItem(placement: .confirmationAction) {
        Button("Done") { dismiss() }
          .accessibilityIdentifier("problem-report.done")
      }
    } else {
      ToolbarItem(placement: .cancellationAction) {
        Button(role: .cancel) { cancel() }
          .disabled(form.phase == .sending)
          .accessibilityIdentifier("problem-report.cancel")
          .confirmationDialog(
            "Discard this report?", isPresented: $confirmsDiscard, titleVisibility: .hidden
          ) {
            Button("Discard Report", role: .destructive) { dismiss() }
          }
      }
      ToolbarItem(placement: .confirmationAction) {
        if form.phase == .sending {
          ProgressView()
            .accessibilityLabel("Sending")
        } else {
          Button("Send") { Task { await form.send() } }
            .disabled(!form.isSendEnabled)
            .accessibilityIdentifier("problem-report.send")
        }
      }
    }
  }

  private var note: LocalizedStringKey {
    switch form.note {
    case .signedIn: Self.signedInNote
    case .signedOut: Self.signedOutNote
    case .cannotSend: Self.cannotSendNote
    }
  }

  private func cancel() {
    if form.hasTypedText {
      confirmsDiscard = true
    } else {
      dismiss()
    }
  }
}
