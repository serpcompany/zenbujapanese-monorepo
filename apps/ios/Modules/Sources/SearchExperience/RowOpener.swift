import SwiftUI

enum RowOpening<Link: Hashable> {
  case link(Link)
  case action(@MainActor () -> Void)
}

struct RowOpener<Link: Hashable, Label: View>: View {
  let opening: RowOpening<Link>
  @ViewBuilder let label: Label

  var body: some View {
    switch opening {
    case .link(let link):
      NavigationLink(value: link) { label }
    case .action(let open):
      Button(action: open) { label }
        .foregroundStyle(.primary)
    }
  }
}
