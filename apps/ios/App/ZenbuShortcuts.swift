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

struct LookUpWordIntent: AppIntent {
  static let title: LocalizedStringResource = "Look Up Word in Zenbu"
  static let description = IntentDescription(
    "Opens Zenbu Japanese on a word from your searches, your lists, your known words, or common JLPT words."
  )
  static let supportedModes: IntentModes = .foreground(.immediate)

  @Parameter(title: "Word", requestValueDialog: "Which word would you like to look up?")
  var word: WordEntity

  static var parameterSummary: some ParameterSummary {
    Summary("Look up \(\.$word) in Zenbu")
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    AppLinkInbox.shared.lookUp(word.siriWord.written)
    return .result()
  }
}

struct WordEntity: AppEntity {
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Word"
  static let defaultQuery = WordQuery()

  let siriWord: SiriWord

  var id: String { siriWord.id }

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(
      title: LocalizedStringResource(stringLiteral: siriWord.spoken),
      subtitle: siriWord.shownWritten.map { LocalizedStringResource(stringLiteral: $0) })
  }
}

struct WordQuery: EntityQuery {
  func entities(for identifiers: [WordEntity.ID]) async throws -> [WordEntity] {
    identifiers.compactMap(SiriWord.init(id:)).map(WordEntity.init(siriWord:))
  }

  @MainActor
  func suggestedEntities() async throws -> [WordEntity] {
    SiriWordList.shared.words.map(WordEntity.init(siriWord:))
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
      phrases: [
        "\(.applicationName)", "\(.applicationName) look up", "\(.applicationName) lookup",
        "Look up in \(.applicationName)", "Look up a word in \(.applicationName)",
      ],
      shortTitle: "Look Up", systemImageName: "character.book.closed")
    AppShortcut(
      intent: LookUpWordIntent(),
      phrases: ["\(.applicationName) look up \(\.$word)"],
      shortTitle: "Look Up Word", systemImageName: "character.book.closed")
    AppShortcut(
      intent: TranslateIntent(),
      phrases: [
        "\(.applicationName) translate", "Translate with \(.applicationName)",
        "Translate text in \(.applicationName)",
      ],
      shortTitle: "Translate", systemImageName: "translate")
  }
}
