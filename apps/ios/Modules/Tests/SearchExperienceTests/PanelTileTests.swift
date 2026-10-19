import SwiftUI
import Testing

@testable import SearchExperience

@Suite("Panel tiles")
struct PanelTileTests {
  @Test("a panel shows five tiles a row, and three at an accessibility text size")
  func columns() {
    #expect(PanelTile.columns(.large).count == 5)
    #expect(PanelTile.columns(.xxxLarge).count == 5)
    #expect(PanelTile.columns(.accessibility1).count == 3)
    #expect(PanelTile.columns(.accessibility5).count == 3)
  }
}
