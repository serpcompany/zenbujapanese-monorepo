import Foundation
import Synchronization
import Testing

@testable import SearchExperience

@Suite("Report a Problem form")
@MainActor
struct ProblemReportFormTests {
  private final class Outbox: Sendable {
    let sent = Mutex<[ProblemReport]>([])

    func sender(canSend: Bool = true) -> ProblemReportSender {
      ProblemReportSender(
        canSend: { canSend }, send: { report in self.sent.withLock { $0.append(report) } })
    }
  }

  private static func form(
    accountEmail: String? = nil, canSend: Bool = true, outbox: Outbox = Outbox()
  ) -> ProblemReportForm {
    let form = ProblemReportForm(
      accountEmail: accountEmail, sender: outbox.sender(canSend: canSend))
    form.show(ProblemReportFixtures.details)
    return form
  }

  @Test("Send stays off until What happened? has text")
  func sendNeedsADescription() {
    let form = Self.form()
    #expect(!form.isSendEnabled)
    form.description = "  \n "
    #expect(!form.isSendEnabled)
    form.description = "Search froze"
    #expect(form.isSendEnabled)
  }

  @Test("Send stays off while a non-empty email isn't an address")
  func sendNeedsAnEmailOrNone() {
    let form = Self.form()
    form.description = "Search froze"
    form.email = "pat@"
    #expect(!form.emailIsValid)
    #expect(!form.isSendEnabled)
    form.email = " pat@example.com "
    #expect(form.emailIsValid)
    #expect(form.isSendEnabled)
    form.email = ""
    #expect(form.emailIsValid)
    #expect(form.isSendEnabled)
  }

  @Test("Send stays off until the details are ready")
  func sendWaitsForTheDetails() {
    let form = ProblemReportForm(accountEmail: nil, sender: Outbox().sender())
    form.description = "Search froze"
    #expect(!form.isSendEnabled)
    form.show(ProblemReportFixtures.details)
    #expect(form.isSendEnabled)
  }

  @Test("a build that can't send keeps Send off and gives the support address")
  func noDestination() {
    let form = Self.form(accountEmail: "learner@example.com", canSend: false)
    form.description = "Search froze"
    #expect(!form.isSendEnabled)
    #expect(form.note == .cannotSend)
  }

  @Test("signed in, the email opens filled in with the account's, and the note says so")
  func signedIn() {
    let form = Self.form(accountEmail: "learner@example.com")
    #expect(form.email == "learner@example.com")
    #expect(form.note == .signedIn)
  }

  @Test("signed out, the email opens empty and the note asks for one")
  func signedOut() {
    let form = Self.form()
    #expect(form.email.isEmpty)
    #expect(form.note == .signedOut)
  }

  @Test("only typed text asks before the form closes, not the filled-in email")
  func typedText() {
    let form = Self.form(accountEmail: "learner@example.com")
    #expect(!form.hasTypedText)
    form.email = ""
    #expect(!form.hasTypedText)
    form.email = "other@example.com"
    #expect(form.hasTypedText)
    form.email = "learner@example.com"
    form.description = "Search froze"
    #expect(form.hasTypedText)

    let signedOut = Self.form()
    signedOut.email = "pat@example.com"
    #expect(signedOut.hasTypedText)
  }

  @Test("sending sends what the form shows once, then says it's sent")
  func sending() async {
    let outbox = Outbox()
    let form = Self.form(accountEmail: "learner@example.com", outbox: outbox)
    form.description = "Search froze"
    await form.send()
    #expect(form.phase == .sent)
    #expect(!form.isSendEnabled)
    await form.send()
    let sent = outbox.sent.withLock { $0 }
    #expect(
      sent == [
        ProblemReport(
          description: "Search froze", email: "learner@example.com",
          details: ProblemReportFixtures.details)
      ])
  }

  @Test("a cleared email sends no contact")
  func clearedEmailSendsNoContact() async {
    let outbox = Outbox()
    let form = Self.form(accountEmail: "learner@example.com", outbox: outbox)
    form.description = "Search froze"
    form.email = ""
    await form.send()
    #expect(outbox.sent.withLock { $0.first?.contact } == nil)
  }
}
