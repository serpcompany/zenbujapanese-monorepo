enum AccountBackgroundSync {
  static let taskIdentifier = "com.zenbujapanese.app.account-sync"

  @MainActor
  static func run() async {
    await ZenbuAccount.shared?.scheduler.backgroundRefresh()
  }
}
