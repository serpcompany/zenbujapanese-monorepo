import SwiftUI

#if os(macOS)
  enum ListEditMode: Hashable, Sendable {
    case inactive
    case active

    var isEditing: Bool { self == .active }
  }
#else
  typealias ListEditMode = EditMode
#endif

extension EnvironmentValues {
  var isEditingList: Bool {
    #if os(macOS)
      false
    #else
      editMode?.wrappedValue.isEditing == true
    #endif
  }
}

struct ListEditButton: View {
  var body: some View {
    #if os(macOS)
      EmptyView()
    #else
      EditButton()
    #endif
  }
}

extension View {
  func listEditMode(_ mode: Binding<ListEditMode>) -> some View {
    #if os(macOS)
      self
    #else
      environment(\.editMode, mode)
    #endif
  }
}
