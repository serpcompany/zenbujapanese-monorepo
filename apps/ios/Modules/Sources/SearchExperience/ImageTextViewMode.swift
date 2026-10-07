import SwiftUI

enum ImageTextViewMode: String, CaseIterable, Identifiable {
  case photo
  case both
  case text
  case translate

  var id: Self { self }

  var title: LocalizedStringKey {
    switch self {
    case .photo: "Photo"
    case .both: "Both"
    case .text: "Text"
    case .translate: "Translate"
    }
  }
}
