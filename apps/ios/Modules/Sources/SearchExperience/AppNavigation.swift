import Foundation
import SwiftUI

enum SearchExperienceTab: Hashable, CaseIterable, Identifiable {
  case search
  case translate
  case watchAndListen
  case account

  var id: Self { self }

  var title: LocalizedStringKey {
    switch self {
    case .search: "Search"
    case .translate: "Translate"
    case .watchAndListen: "Player"
    case .account: "Account"
    }
  }

  var systemImage: String {
    switch self {
    case .search: "magnifyingglass"
    case .translate: "translate"
    case .watchAndListen: "play.rectangle"
    case .account: "person.crop.circle"
    }
  }

  var label: Label<Text, Image> {
    Label(title, systemImage: systemImage)
  }

  var shortcut: KeyEquivalent {
    switch self {
    case .search: "1"
    case .translate: "2"
    case .watchAndListen: "3"
    case .account: "4"
    }
  }
}

enum AppCommand: Hashable, Sendable {
  case select(SearchExperienceTab)
  case findInDictionary
  case searchImage
}

struct AppCommandRequest: Equatable {
  let id = UUID()
  let window: UUID
  let command: AppCommand
}

@MainActor
@Observable
final class AppCommandRouter {
  private(set) var activeWindow: UUID?
  private(set) var request: AppCommandRequest?
  private var openWindows: Set<UUID> = []

  var hasOpenWindows: Bool { !openWindows.isEmpty }

  func windowOpened(_ window: UUID) {
    openWindows.insert(window)
  }

  func windowBecameActive(_ window: UUID) {
    activeWindow = window
  }

  func windowClosed(_ window: UUID) {
    openWindows.remove(window)
    if activeWindow == window { activeWindow = nil }
  }

  func send(_ command: AppCommand) {
    guard let activeWindow else { return }
    request = AppCommandRequest(window: activeWindow, command: command)
  }
}

struct AppCommandHandling: ViewModifier {
  @Environment(AppCommandRouter.self) private var router
  @Environment(TranslateExperience.self) private var translate
  @Environment(\.appearsActive) private var appearsActive
  @State private var window = UUID()
  let perform: (AppCommand) -> Void

  func body(content: Content) -> some View {
    content
      .onAppear { router.windowOpened(window) }
      .onChange(of: appearsActive, initial: true) { _, isActive in
        if isActive { router.windowBecameActive(window) }
      }
      .onChange(of: router.request) { _, request in
        guard let request, request.window == window else { return }
        perform(request.command)
      }
      .onDisappear {
        router.windowClosed(window)
        if !router.hasOpenWindows { AppLifecycle.lastWindowClosed(translate: translate) }
      }
  }
}

struct AppMenuItem: Identifiable {
  let title: LocalizedStringKey
  let command: AppCommand
  let shortcut: KeyboardShortcut

  var id: AppCommand { command }

  static var editing: [AppMenuItem] {
    [
      AppMenuItem(
        title: "Find in Dictionary", command: .findInDictionary, shortcut: KeyboardShortcut("f")),
      AppMenuItem(
        title: "Search an Image…", command: .searchImage,
        shortcut: KeyboardShortcut("i", modifiers: [.command, .shift])),
    ]
  }

  static var tabs: [AppMenuItem] {
    SearchExperienceTab.allCases.map { tab in
      AppMenuItem(title: tab.title, command: .select(tab), shortcut: KeyboardShortcut(tab.shortcut))
    }
  }
}

struct AppCommands: Commands {
  let router: AppCommandRouter

  var body: some Commands {
    CommandGroup(before: .textEditing) {
      buttons(for: AppMenuItem.editing)
      Divider()
    }
    CommandGroup(before: .toolbar) {
      buttons(for: AppMenuItem.tabs)
      Divider()
    }
  }

  private func buttons(for items: [AppMenuItem]) -> some View {
    ForEach(items) { item in
      Button(item.title) { router.send(item.command) }
        .keyboardShortcut(item.shortcut)
    }
  }
}
