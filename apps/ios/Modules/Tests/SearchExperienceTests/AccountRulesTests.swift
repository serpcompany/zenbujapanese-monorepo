import Foundation
import Testing
@testable import SearchExperience

@Suite("Account rules, answered by the shared rules' bundle")
struct AccountRulesTests {
  @Test("a sign-in code is six digits once trimmed, as the shared cases say, and only that is sent")
  func signInCodes() throws {
    let codes = try SharedAccountCases.rule("sign-in-code")
    for code in codes.accepted {
      #expect(AccountRules.shared.signInCode(code.typed.value) == code.kept.value, "\(code.covers)")
    }
    for code in codes.refused {
      #expect(AccountRules.shared.signInCode(code.typed.value) == nil, "\(code.covers)")
    }
  }

  @Test("a note the account would refuse for its length is told from one it takes")
  func longNotes() throws {
    let notes = try SharedAccountCases.rule("note-text")
    for note in notes.accepted {
      #expect(AccountRules.shared.noteFitsTheAccount(note.typed.value), "\(note.covers)")
    }
    for note in notes.refused {
      #expect(!AccountRules.shared.noteFitsTheAccount(note.typed.value), "\(note.covers)")
    }
  }

  @Test("Zenbu Account says how many notes are too long to sync, and why")
  func longNotesMessage() {
    #expect(AccountMessage.longNotes(0) == nil)
    #expect(
      AccountMessage.longNotes(1)
        == "1 note is over 10,000 characters, so it stays on this \(ThisDevice.name) without syncing. Shorten it, and it syncs."
    )
    #expect(
      AccountMessage.longNotes(2)
        == "2 notes are over 10,000 characters, so they stay on this \(ThisDevice.name) without syncing. Shorten them, and they sync."
    )
  }
}
