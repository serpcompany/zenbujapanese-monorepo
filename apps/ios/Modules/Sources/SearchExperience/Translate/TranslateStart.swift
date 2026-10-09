import Foundation
import TranslatorCore

enum TranslateStart: String, CaseIterable, Identifiable {
  case conversation
  case listening
  case text
  case document
  case camera

  var id: Self { self }

  var liveMode: TranslateMode? {
    switch self {
    case .conversation: .conversation
    case .listening: .listening
    case .text, .document, .camera: nil
    }
  }

  var title: String {
    switch self {
    case .conversation: String(localized: "Conversation")
    case .listening: String(localized: "Listening")
    case .text: String(localized: "Text")
    case .document: String(localized: "Document Upload")
    case .camera: String(localized: "Camera")
    }
  }

  var systemImage: String {
    switch self {
    case .conversation: "bubble.left.and.bubble.right"
    case .listening: "ear"
    case .text: "keyboard"
    case .document: "doc.text"
    case .camera: "camera"
    }
  }

  var summary: String {
    switch self {
    case .conversation:
      String(localized: "Take turns speaking Japanese or English. Translations play out loud on your iPhone.")
    case .listening:
      String(localized: "Translate the Japanese or English around you, like a TV, a guide, or announcements. Best with earphones.")
    case .text:
      String(localized: "Type or paste Japanese or English to translate it.")
    case .document:
      String(localized: "Translate the text in a PDF, a photo, or a text file.")
    case .camera:
      String(
        localized:
          "Point the camera at Japanese, or pick photos, and tap any word to look it up.")
    }
  }

  var heroSymbol: String {
    switch self {
    case .conversation: "person.2.wave.2.fill"
    case .listening: "ear.badge.waveform"
    case .text: "character.cursor.ibeam"
    case .document: "doc.text.fill"
    case .camera: "camera.viewfinder"
    }
  }
}
