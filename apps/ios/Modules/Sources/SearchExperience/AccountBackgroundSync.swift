public enum AccountBackgroundSync {
  public static let taskIdentifier = "com.zenbujapanese.app.account-sync"

  @MainActor
  public static func run() async {
    await ZenbuAccount.shared?.scheduler.backgroundRefresh()
  }
}
