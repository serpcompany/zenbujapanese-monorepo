enum SearchInputMode: Equatable {
  case inactive
  case keyboard
  case handwriting
  case radicals
  case grade

  var opensPanel: Bool {
    self == .handwriting || self == .radicals || self == .grade
  }
}
