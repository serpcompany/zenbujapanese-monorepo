import Foundation
import SwiftUI
import Testing

@testable import SearchExperience

@MainActor
@Suite("Menu commands and windows")
struct AppCommandTests {
  @Test("a command goes to the window that was last active")
  func activeWindow() throws {
    let router = AppCommandRouter()
    let first = UUID()
    let second = UUID()
    router.windowBecameActive(first)
    router.windowBecameActive(second)
    router.send(.findInDictionary)
    let request = try #require(router.request)
    #expect(request.window == second)
    #expect(request.command == .findInDictionary)
  }

  @Test("a command with no window open goes nowhere")
  func noWindow() {
    let router = AppCommandRouter()
    let window = UUID()
    router.windowBecameActive(window)
    router.windowClosed(window)
    router.send(.select(.account))
    #expect(router.request == nil)
    #expect(router.activeWindow == nil)
  }

  @Test("closing the last open window leaves none open")
  func lastWindow() {
    let router = AppCommandRouter()
    let first = UUID()
    let second = UUID()
    router.windowOpened(first)
    router.windowOpened(second)
    router.windowClosed(first)
    #expect(router.hasOpenWindows)
    router.windowClosed(second)
    #expect(!router.hasOpenWindows)
  }

  @Test("closing a window that wasn't active keeps the active one")
  func closingAnotherWindow() {
    let router = AppCommandRouter()
    let active = UUID()
    router.windowBecameActive(active)
    router.windowClosed(UUID())
    #expect(router.activeWindow == active)
  }

  @Test("the same command sent twice is two requests, so a window acts on both")
  func repeatedCommand() throws {
    let router = AppCommandRouter()
    router.windowBecameActive(UUID())
    router.send(.searchImage)
    let first = try #require(router.request)
    router.send(.searchImage)
    #expect(router.request != first)
  }

  @Test("every tab has its own title, symbol, and shortcut, in sidebar order")
  func tabs() {
    let tabs = SearchExperienceTab.allCases
    #expect(tabs == [.search, .translate, .watchAndListen, .account])
    #expect(Set(tabs.map(\.systemImage)).count == tabs.count)
    #expect(tabs.map(\.shortcut.character) == ["1", "2", "3", "4"])
  }

  @Test("the Mac window opens larger than its minimum, and Settings fits inside it")
  func windowSizes() {
    #expect(AppWindow.defaultSize.width > AppWindow.minimumSize.width)
    #expect(AppWindow.defaultSize.height > AppWindow.minimumSize.height)
    #expect(AppWindow.settingsSize.width < AppWindow.minimumSize.width)
  }
}
