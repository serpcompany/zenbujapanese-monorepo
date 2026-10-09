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

enum AppCommand: Equatable, Sendable {
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

struct AppCommands: Commands {
  let router: AppCommandRouter

  var body: some Commands {
    CommandGroup(before: .textEditing) {
      Button("Find in Dictionary") { router.send(.findInDictionary) }
        .keyboardShortcut("f")
      Button("Search an Image…") { router.send(.searchImage) }
        .keyboardShortcut("i", modifiers: [.command, .shift])
      Divider()
    }
    CommandGroup(before: .toolbar) {
      ForEach(SearchExperienceTab.allCases) { tab in
        Button(tab.title) { router.send(.select(tab)) }
          .keyboardShortcut(tab.shortcut)
      }
      Divider()
    }
  }
}
