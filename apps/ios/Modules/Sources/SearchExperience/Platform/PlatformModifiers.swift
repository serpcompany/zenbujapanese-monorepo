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

  func tabShell() -> some View {
    #if os(macOS)
      tabViewStyle(.tabBarOnly)
    #else
      tabViewStyle(.sidebarAdaptable)
    #endif
  }

  func backButtonHidden(_ hidden: Bool = true) -> some View {
    #if os(macOS)
      self
    #else
      navigationBarBackButtonHidden(hidden)
    #endif
  }

  func listedInItsMenu() -> some View {
    #if os(macOS)
      pickerStyle(.inline)
    #else
      self
    #endif
  }

  func tileIconLabel() -> some View {
    #if os(macOS)
      labelStyle(TileIconLabelStyle())
    #else
      self
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

extension EnvironmentValues {
  @Entry var isInSheetOnMac = false
}

extension View {
  func dragToCloseSheet(sizeOnMac size: CGSize) -> some View {
    #if os(macOS)
      safeAreaInset(edge: .bottom, spacing: 0) { SheetDoneBar() }
        .sheetSize(onMac: size)
    #else
      presentationDetents([.large]).presentationDragIndicator(.visible)
    #endif
  }

  func sheetSize(onMac size: CGSize) -> some View {
    #if os(macOS)
      frame(width: size.width, height: size.height)
        .environment(\.isInSheetOnMac, true)
    #else
      self
    #endif
  }
}

extension View {
  func barTrailingItems<Items: View>(@ViewBuilder _ items: @escaping () -> Items) -> some View {
    modifier(BarTrailingItems(items: items))
  }
}

private struct BarTrailingItems<Items: View>: ViewModifier {
  @Environment(\.isInSheetOnMac) private var isInSheetOnMac
  @ViewBuilder let items: () -> Items

  func body(content: Content) -> some View {
    if isInSheetOnMac {
      content.safeAreaInset(edge: .top, spacing: 0) {
        HStack(spacing: 12) {
          Spacer()
          items()
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
      }
    } else {
      content.toolbar { ToolbarItemGroup(placement: .barTrailing, content: items) }
    }
  }
}

struct SheetCloseAndAction<Close: View, Action: View>: ToolbarContent {
  @ViewBuilder let close: () -> Close
  @ViewBuilder let action: () -> Action

  var body: some ToolbarContent {
    #if os(macOS)
      ToolbarItem(placement: .cancellationAction) {
        HStack {
          close().keyboardShortcut(.cancelAction)
          action()
        }
      }
    #else
      ToolbarItemGroup(placement: .topBarLeading) {
        close()
        action()
      }
    #endif
  }
}

#if os(macOS)
  private struct TileIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
      HStack(spacing: 10) {
        configuration.icon
        configuration.title
      }
    }
  }

  private struct SheetDoneBar: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
      HStack {
        Spacer()
        Button("Done") { dismiss() }
          .keyboardShortcut(.cancelAction)
          .accessibilityIdentifier("sheet.done")
      }
      .padding(.horizontal, 16)
      .padding(.bottom, 12)
    }
  }
#endif

extension SearchFieldPlacement {
  static var alwaysShown: SearchFieldPlacement {
    #if os(macOS)
      .toolbar
    #else
      .navigationBarDrawer(displayMode: .always)
    #endif
  }
}

enum TabBarLayout {
  #if os(macOS)
    static let bottomClearance: CGFloat = 12
  #else
    static let bottomClearance: CGFloat = 60
  #endif
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

  static var sheetClose: ToolbarItemPlacement {
    #if os(macOS)
      .cancellationAction
    #else
      .topBarLeading
    #endif
  }
}

extension View {
  func rowActions<Actions: View>(
    allowsFullSwipe: Bool = true,
    @ViewBuilder actions: () -> Actions
  ) -> some View {
    #if os(macOS)
      let buttons = actions()
      return swipeActions(allowsFullSwipe: allowsFullSwipe) { buttons }
        .contextMenu { buttons }
    #else
      swipeActions(allowsFullSwipe: allowsFullSwipe, content: actions)
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
