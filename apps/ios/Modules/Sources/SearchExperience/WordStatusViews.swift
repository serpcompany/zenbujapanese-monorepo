import SwiftUI

struct KnownWordChoice: Equatable {
  let status: WordKnowledgeStatus
  let title: LocalizedStringKey
  let systemImage: String
  let action: String
  let tint: Color
  var isEnabled = true

  static var cantChange: KnownWordChoice {
    KnownWordChoice(
      status: .unknown, title: "Known Words Can’t Be Changed", systemImage: "xmark.circle",
      action: "mark-unknown", tint: .gray, isEnabled: false)
  }
}

extension KnownWordChoice {
  init(_ status: WordKnowledgeStatus, isEnabled: Bool) {
    switch status {
    case .learning:
      self.init(
        status: status, title: "Mark as Learning", systemImage: WordStatusTag.learningSymbol,
        action: "mark-learning", tint: .yellow, isEnabled: isEnabled)
    case .known:
      self.init(
        status: status, title: "Mark as Known", systemImage: "checkmark.circle",
        action: "mark-known", tint: .green, isEnabled: isEnabled)
    default:
      self.init(
        status: .unknown, title: "Mark as Unknown", systemImage: "xmark.circle",
        action: "mark-unknown", tint: .orange, isEnabled: isEnabled)
    }
  }
}

extension WordKnowledgeStatus {
  var title: LocalizedStringKey {
    switch self {
    case .learning: "Learning"
    case .known: "Known"
    default: "Unknown"
    }
  }
}

extension WordKnowledge {
  func choices(for item: SavedItem) -> [KnownWordChoice] {
    guard !isReadOnly else { return [.cantChange] }
    let current = status(item)
    return [WordKnowledgeStatus.unknown, .known, .learning].filter { $0 != current }
      .map { KnownWordChoice($0, isEnabled: isLoaded) }
  }
}

struct WordStatusPicker: View {
  @Environment(WordKnowledge.self) private var wordKnowledge
  let item: SavedItem
  let identifierPrefix: String

  var body: some View {
    let current = wordKnowledge.status(item)
    Picker(
      selection: Binding(get: { current }, set: { wordKnowledge.setStatus($0, for: item) })
    ) {
      ForEach(WordKnowledgeStatus.chosen, id: \.self) { Text($0.title).tag($0) }
    } label: {
      Text("Status")
      Text(wordKnowledge.isReadOnly ? KnownWordChoice.cantChange.title : current.title)
    }
    .pickerStyle(.menu)
    .disabled(!wordKnowledge.canChange)
    .accessibilityIdentifier("\(identifierPrefix).status")
  }
}

private struct WordStatusActions: ViewModifier {
  @Environment(WordKnowledge.self) private var wordKnowledge
  let item: SavedItem
  let identifierPrefix: String

  func body(content: Content) -> some View {
    content
      .swipeActions(edge: .leading) {
        ForEach(wordKnowledge.choices(for: item), id: \.action) { choice in
          Button(choice.title, systemImage: choice.systemImage) {
            wordKnowledge.setStatus(choice.status, for: item)
          }
          .tint(choice.tint)
          .disabled(!choice.isEnabled)
          .accessibilityIdentifier("\(identifierPrefix).\(choice.action)")
        }
      }
      .contextMenu {
        WordStatusPicker(item: item, identifierPrefix: identifierPrefix)
      }
  }
}

extension View {
  func wordStatusActions(_ item: SavedItem, identifierPrefix: String) -> some View {
    modifier(WordStatusActions(item: item, identifierPrefix: identifierPrefix))
  }
}

struct WordStatusTag: View {
  nonisolated static let learningSymbol = "circle.lefthalf.filled"

  @Environment(\.colorScheme) private var colorScheme
  private let title: LocalizedStringKey
  private let systemImage: String
  private let color: Color
  private let shadeInLight: Double
  private let announces: Bool

  init?(_ status: WordKnowledgeStatus, announces: Bool = false) {
    switch status {
    case .known: (systemImage, color, shadeInLight) = ("checkmark", .green, 0)
    case .learning: (systemImage, color, shadeInLight) = (Self.learningSymbol, .yellow, 0.5)
    default: return nil
    }
    title = status.title
    self.announces = announces
  }

  var body: some View {
    HStack(spacing: 3) {
      Image(systemName: systemImage)
      Text(title)
    }
    .font(.caption.weight(.semibold))
    .foregroundStyle(foreground(in: colorScheme))
    .padding(.horizontal, 8)
    .padding(.vertical, 3)
    .background(background, in: .capsule)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(title)
    .accessibilityHidden(!announces)
  }

  var background: Color { color.opacity(0.15) }

  func foreground(in colorScheme: ColorScheme) -> Color {
    colorScheme == .light ? color.mix(with: .black, by: shadeInLight) : color
  }
}
