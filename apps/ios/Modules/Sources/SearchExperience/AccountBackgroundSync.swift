enum AccountBackgroundSync {
  static let taskIdentifier = "com.zenbujapanese.dictionary.account-sync"

  @MainActor
  static func run() async {
    await ZenbuAccount.shared?.scheduler.backgroundRefresh()
  }
}
