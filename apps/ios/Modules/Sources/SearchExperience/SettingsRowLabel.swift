import SwiftUI

struct SettingsRowLabel: View {
  let title: LocalizedStringKey
  let subtitle: String?
  let systemImage: String
  let tint: Color
  @ScaledMetric(relativeTo: .body) private var tileSize = 30
  @ScaledMetric(relativeTo: .body) private var symbolSize = 15

  init(
    _ title: LocalizedStringKey, subtitle: String? = nil, systemImage: String, tint: Color
  ) {
    self.title = title
    self.subtitle = subtitle
    self.systemImage = systemImage
    self.tint = tint
  }

  var body: some View {
    Label {
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
        if let subtitle {
          Text(subtitle)
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      }
    } icon: {
      Image(systemName: systemImage)
        .font(.system(size: symbolSize, weight: .semibold))
        .foregroundStyle(.white)
        .frame(width: tileSize, height: tileSize)
        .background(tint.gradient, in: .rect(cornerRadius: tileSize * 0.23))
    }
    .tileIconLabel()
  }
}
