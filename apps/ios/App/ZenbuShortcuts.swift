import AppIntents
import SearchExperience

struct LookUpIntent: AppIntent {
  static let title: LocalizedStringResource = "Look Up in Zenbu"
  static let description = IntentDescription(
    "Opens Zenbu Japanese on the word's page, or on its search results when the text isn't one word."
  )
  static let supportedModes: IntentModes = .foreground(.immediate)

  @Parameter(
    title: "Text", requestValueDialog: "What would you like to look up?",
    inputConnectionBehavior: .connectToPreviousIntentResult)
  var text: String

  static var parameterSummary: some ParameterSummary {
    Summary("Look up \(\.$text) in Zenbu")
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    AppLinkInbox.shared.lookUp(text)
    return .result()
  }
}

struct TranslateIntent: AppIntent {
  static let title: LocalizedStringResource = "Translate with Zenbu"
  static let description = IntentDescription(
    "Opens Translate's typed translation in Zenbu Japanese with the text.")
  static let supportedModes: IntentModes = .foreground(.immediate)

  @Parameter(
    title: "Text", requestValueDialog: "What would you like to translate?",
    inputConnectionBehavior: .connectToPreviousIntentResult)
  var text: String

  static var parameterSummary: some ParameterSummary {
    Summary("Translate \(\.$text) with Zenbu")
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    AppLinkInbox.shared.translate(text)
    return .result()
  }
}

struct ZenbuShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: LookUpIntent(),
      phrases: ["Look up in \(.applicationName)", "Look up a word in \(.applicationName)"],
      shortTitle: "Look Up", systemImageName: "character.book.closed")
    AppShortcut(
      intent: TranslateIntent(),
      phrases: ["Translate with \(.applicationName)", "Translate text in \(.applicationName)"],
      shortTitle: "Translate", systemImageName: "translate")
  }
}
