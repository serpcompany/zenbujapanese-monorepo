import Foundation
import notify

enum DarwinNotice {
  static func observe(_ name: String, _ handle: @escaping @Sendable (UInt64) -> Void) {
    var registration: Int32 = 0
    notify_register_dispatch(name, &registration, .global()) { registration in
      var state: UInt64 = 0
      notify_get_state(registration, &state)
      handle(state)
    }
  }
}
