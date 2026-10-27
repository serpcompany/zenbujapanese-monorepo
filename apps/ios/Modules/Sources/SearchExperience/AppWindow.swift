import CoreGraphics

enum AppWindow {
  static let defaultSize = CGSize(width: 1_180, height: 820)
  static let minimumSize = CGSize(width: 760, height: 560)
  static let settingsSize = CGSize(width: 620, height: 560)
  static let photoPickerSize = CGSize(width: 720, height: 520)
  static let inputPanelSize = CGSize(width: 460, height: 720)
  static let sheetSize = CGSize(width: 480, height: 520)
  static let roomAroundASheet = minimumSize.height - sheetSize.height

  static func sheet(_ size: CGSize, inWindowOfHeight height: CGFloat?) -> CGSize {
    guard let height else { return size }
    return CGSize(width: size.width, height: min(size.height, height - roomAroundASheet))
  }
}
