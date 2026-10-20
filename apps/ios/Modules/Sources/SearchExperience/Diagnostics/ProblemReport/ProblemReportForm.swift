import Foundation
import Observation

struct ProblemReportSender: Sendable {
  var canSend: @MainActor @Sendable () -> Bool
  var send: @MainActor @Sendable (ProblemReport) async -> Void

  static let live = ProblemReportSender(
    canSend: { CrashReporter.canSendProblemReports },
    send: { report in
      await Task.yield()
      CrashReporter.send(report)
    })
}

@MainActor
@Observable
final class ProblemReportForm {
  enum Phase: Equatable { case editing, sending, sent }
  enum Note: Equatable { case signedIn, signedOut, cannotSend }

  var description = ""
  var email: String
  private(set) var phase = Phase.editing
  private(set) var details: ProblemReportDetails?
  let canSend: Bool
  private let accountEmail: String
  private let sender: ProblemReportSender

  init(accountEmail: String?, sender: ProblemReportSender) {
    self.accountEmail = accountEmail ?? ""
    email = accountEmail ?? ""
    self.sender = sender
    canSend = sender.canSend()
  }

  var note: Note {
    guard canSend else { return .cannotSend }
    return accountEmail.isEmpty ? .signedOut : .signedIn
  }

  var emailIsValid: Bool {
    let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty || ProblemReport.isEmail(trimmed)
  }

  var isSendEnabled: Bool {
    canSend && phase == .editing && details != nil && hasDescription && emailIsValid
  }

  var hasTypedText: Bool {
    let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
    return hasDescription || (!trimmed.isEmpty && trimmed != accountEmail)
  }

  func show(_ details: ProblemReportDetails) {
    self.details = details
  }

  func send() async {
    guard isSendEnabled, let details else { return }
    phase = .sending
    await sender.send(ProblemReport(description: description, email: email, details: details))
    phase = .sent
  }

  private var hasDescription: Bool {
    !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }
}
