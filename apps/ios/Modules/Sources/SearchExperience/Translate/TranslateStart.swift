import SwiftUI
import TranslatorCore

enum TranslateStart: String, CaseIterable, Identifiable {
  case conversation
  case listening
  case text
  case document
  case image

  static let spokenRows: [TranslateStart] = [.conversation, .listening]
  static let writtenRows: [TranslateStart] = [.image, .text, .document]

  var id: Self { self }

  var liveMode: TranslateMode? {
    switch self {
    case .conversation: .conversation
    case .listening: .listening
    case .text, .document, .image: nil
    }
  }

  var title: String {
    switch self {
    case .conversation: String(localized: "Conversation")
    case .listening: String(localized: "Listen")
    case .text: String(localized: "Text")
    case .document: String(localized: "Document")
    case .image: String(localized: "Image")
    }
  }

  var systemImage: String {
    switch self {
    case .conversation: "bubble.left.and.bubble.right.fill"
    case .listening: "ear.fill"
    case .text: "keyboard.fill"
    case .document: "doc.text.fill"
    case .image: "photo.fill"
    }
  }

  var tint: Color {
    switch self {
    case .conversation: .blue
    case .listening: .indigo
    case .text: .gray
    case .document: .orange
    case .image: .green
    }
  }
}
