import Foundation

#if os(iOS)
  import BackgroundTasks
#endif

enum BackgroundRefresh {
  static func schedule(_ identifier: String, notBefore date: Date) {
    #if os(iOS)
      let request = BGAppRefreshTaskRequest(identifier: identifier)
      request.earliestBeginDate = date
      try? BGTaskScheduler.shared.submit(request)
    #endif
  }
}
