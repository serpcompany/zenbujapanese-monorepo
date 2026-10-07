import SwiftUI
import TranslatorCore

struct KeepTranslationsPicker: View {
  let history: ConversationHistory
  @State private var shorter: HistoryRetention?

  var body: some View {
    Picker(selection: selection) {
      ForEach(HistoryRetention.allCases) { retention in
        Text(retention.title).tag(retention)
      }
    } label: {
      AccountRowLabel("Keep Translations", systemImage: "clock.fill", tint: .purple)
    }
    .pickerStyle(.menu)
    .disabled(!history.isLoaded)
    .accessibilityIdentifier("account.keep-translations")
    .confirmationDialog(
      "Delete older conversations?", isPresented: isConfirming, titleVisibility: .visible,
      presenting: shorter
    ) { retention in
      let count = history.expiredCount(under: retention)
      Button("Delete ^[\(count) Conversation](inflect: true)", role: .destructive) {
        history.retention = retention
      }
      Button("Cancel", role: .cancel) {}
    } message: { retention in
      Text(
        "Keeping translations for \(retention.title) deletes ^[\(history.expiredCount(under: retention)) conversation](inflect: true) older than that. This can't be undone."
      )
    }
  }

  private var selection: Binding<HistoryRetention> {
    Binding(
      get: { history.retention },
      set: { retention in
        if history.expiredCount(under: retention) > 0 {
          shorter = retention
        } else {
          history.retention = retention
        }
      })
  }

  private var isConfirming: Binding<Bool> {
    Binding(get: { shorter != nil }, set: { if !$0 { shorter = nil } })
  }
}
