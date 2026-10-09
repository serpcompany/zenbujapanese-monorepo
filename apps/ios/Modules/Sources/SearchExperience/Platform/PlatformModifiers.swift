import SwiftUI

enum TextEntryKind: Sendable {
  case capitalizedWords
  case uncapitalized
  case email
  case number
  case webSearch
}

extension View {
  func inlineNavigationTitle() -> some View {
    #if os(macOS)
      self
    #else
      navigationBarTitleDisplayMode(.inline)
    #endif
  }

  func groupedList() -> some View {
    #if os(macOS)
      listStyle(.inset)
    #else
      listStyle(.insetGrouped)
    #endif
  }

  func compactSectionSpacing() -> some View {
    #if os(macOS)
      self
    #else
      listSectionSpacing(.compact)
    #endif
  }

  func sectionSpacing(_ spacing: CGFloat) -> some View {
    #if os(macOS)
      self
    #else
      listSectionSpacing(spacing)
    #endif
  }

  @ViewBuilder
  func textEntry(_ kind: TextEntryKind) -> some View {
    #if os(macOS)
      self
    #else
      switch kind {
      case .capitalizedWords: textInputAutocapitalization(.words)
      case .uncapitalized: textInputAutocapitalization(.never)
      case .email: keyboardType(.emailAddress).textInputAutocapitalization(.never)
      case .number: keyboardType(.numberPad)
      case .webSearch: keyboardType(.webSearch).textInputAutocapitalization(.never)
      }
    #endif
  }

  func minimizedSearchToolbar() -> some View {
    #if os(macOS)
      self
    #else
      searchToolbarBehavior(.minimize)
    #endif
  }

  func tabBarVisibility(_ visibility: Visibility) -> some View {
    #if os(macOS)
      self
    #else
      toolbar(visibility, for: .tabBar)
    #endif
  }

  @ViewBuilder
  func bottomAccessory<Accessory: View, Fallback: View>(
    isEnabled: Bool,
    @ViewBuilder accessory: () -> Accessory,
    @ViewBuilder fallback: (Self) -> Fallback
  ) -> some View {
    #if os(macOS)
      fallback(self)
    #else
      if #available(iOS 26.1, *) {
        tabViewBottomAccessory(isEnabled: isEnabled, content: accessory)
      } else {
        fallback(self)
      }
    #endif
  }
}

extension SearchFieldPlacement {
  static var alwaysShown: SearchFieldPlacement {
    #if os(macOS)
      .toolbar
    #else
      .navigationBarDrawer(displayMode: .always)
    #endif
  }
}

extension ToolbarItemPlacement {
  static var barLeading: ToolbarItemPlacement {
    #if os(macOS)
      .navigation
    #else
      .topBarLeading
    #endif
  }

  static var barTrailing: ToolbarItemPlacement {
    #if os(macOS)
      .primaryAction
    #else
      .topBarTrailing
    #endif
  }
}

extension View {
  func rowActions<Actions: View>(
    edge: HorizontalEdge = .trailing,
    allowsFullSwipe: Bool = true,
    @ViewBuilder actions: () -> Actions
  ) -> some View {
    #if os(macOS)
      let buttons = actions()
      return swipeActions(edge: edge, allowsFullSwipe: allowsFullSwipe) { buttons }
        .contextMenu { buttons }
    #else
      swipeActions(edge: edge, allowsFullSwipe: allowsFullSwipe, content: actions)
    #endif
  }

  func rowActions<Leading: View, Trailing: View>(
    @ViewBuilder leading: () -> Leading,
    @ViewBuilder trailing: () -> Trailing
  ) -> some View {
    let leadingButtons = leading()
    let trailingButtons = trailing()
    #if os(macOS)
      return swipeActions(edge: .trailing) { trailingButtons }
        .swipeActions(edge: .leading) { leadingButtons }
        .contextMenu {
          leadingButtons
          trailingButtons
        }
    #else
      return swipeActions(edge: .trailing) { trailingButtons }
        .swipeActions(edge: .leading) { leadingButtons }
    #endif
  }
}
