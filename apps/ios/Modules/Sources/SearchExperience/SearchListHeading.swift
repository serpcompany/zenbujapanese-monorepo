import SwiftUI

struct SearchListHeading: View {
  let title: LocalizedStringKey

  init(_ title: LocalizedStringKey) {
    self.title = title
  }

  var body: some View {
    Text(title)
      .font(.headline)
      .listRowSeparator(.hidden)
      .accessibilityAddTraits(.isHeader)
  }
}
