import SwiftUI

struct ImageTextCanvas: View {
  let page: ImageTextPage
  let showsRegions: Bool
  let selectedRegion: ImageTextRegion?
  let outlinedLineID: Int?
  let selectRegion: (ImageTextRegion) -> Void

  var body: some View {
    GeometryReader { geometry in
      if let decoded = DecodedImage(data: page.asset.data) {
        let imageRect = aspectFitRect(imageSize: decoded.size, container: geometry.size)
        ZStack(alignment: .topLeading) {
          decoded.image
            .resizable()
            .scaledToFit()
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .top)
            .accessibilityHidden(true)

          if showsRegions {
            ForEach(page.regions) { region in
              let rect = interactiveTokenRect(
                displayRect(region.boundingBox, in: imageRect),
                isVertical: region.isVertical
              )
              ImageTextRegionButton(
                region: region,
                isSelected: selectedRegion?.id == region.id,
                select: selectRegion
              )
              .frame(width: max(rect.width, 1), height: max(rect.height, 1))
              .position(x: rect.midX, y: rect.midY)
            }
          }

          if let line = page.lines.first(where: { $0.id == outlinedLineID }) {
            let rect = displayRect(line.boundingBox, in: imageRect).insetBy(dx: -3, dy: -3)
            RoundedRectangle(cornerRadius: 4)
              .fill(.tint.opacity(0.12))
              .strokeBorder(.tint, lineWidth: 2)
              .frame(width: rect.width, height: rect.height)
              .position(x: rect.midX, y: rect.midY)
              .allowsHitTesting(false)
              .accessibilityHidden(true)
          }

          Text("")
            .frame(width: 1, height: 1)
            .accessibilityElement()
            .accessibilityLabel(
              "Recognized text \(page.observations.map(\.text).joined(separator: " "))"
            )
            .accessibilityIdentifier("image-text.raw-text")

          Text("")
            .frame(width: 1, height: 1)
            .accessibilityElement()
            .accessibilityLabel(page.asset.name)
            .accessibilityIdentifier("image-text.current-page")
        }
        .animation(.easeInOut(duration: 0.2), value: outlinedLineID)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Imported image \(page.asset.name)")
      }
    }
  }

  private func aspectFitRect(imageSize: CGSize, container: CGSize) -> CGRect {
    let scale = min(container.width / imageSize.width, container.height / imageSize.height)
    let size = CGSize(width: imageSize.width * scale, height: imageSize.height * scale)
    return CGRect(
      x: (container.width - size.width) / 2,
      y: 0,
      width: size.width,
      height: size.height
    )
  }

  private func displayRect(_ normalized: CGRect, in imageRect: CGRect) -> CGRect {
    CGRect(
      x: imageRect.minX + normalized.minX * imageRect.width,
      y: imageRect.minY + (1 - normalized.maxY) * imageRect.height,
      width: normalized.width * imageRect.width,
      height: normalized.height * imageRect.height
    )
  }

  private func interactiveTokenRect(_ recognizedRect: CGRect, isVertical: Bool) -> CGRect {
    if isVertical {
      let gap = min(1.5, recognizedRect.height * 0.08)
      return recognizedRect.insetBy(dx: 0, dy: gap / 2)
    }
    let gap = min(5, recognizedRect.width * 0.16)
    return recognizedRect.insetBy(dx: gap / 2, dy: 0)
  }
}

private struct ImageTextRegionButton: View {
  let region: ImageTextRegion
  let isSelected: Bool
  let select: (ImageTextRegion) -> Void

  var body: some View {
    Button {
      select(region)
    } label: {
      Color.clear
        .contentShape(.rect)
        .background {
          RoundedRectangle(cornerRadius: 3)
            .fill(Color.accentColor.opacity(fillOpacity))
        }
        .overlay(alignment: .bottom) {
          if !region.isVertical { underline }
        }
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Recognized \(region.surface)")
    .accessibilityIdentifier("image-text.region.\(region.surface)")
  }

  private var fillOpacity: Double {
    if region.isVertical {
      return isSelected ? 0.45 : region.indexInLine.isMultiple(of: 2) ? 0.12 : 0.24
    }
    return isSelected ? 0.14 : 0.05
  }

  private var underline: some View {
    Rectangle()
      .fill(Color.accentColor.opacity(isSelected ? 1 : 0.78))
      .frame(height: 3)
  }
}
