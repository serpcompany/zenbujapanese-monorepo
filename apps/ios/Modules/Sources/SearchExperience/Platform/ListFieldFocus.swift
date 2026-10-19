import SwiftUI

extension View {
  func focusedOnceTheClickIsHandled(_ focused: FocusState<Bool>.Binding) -> some View {
    #if os(macOS)
      onAppear {
        afterTheCurrentEvent { focused.wrappedValue = true }
      }
    #else
      self
    #endif
  }
}

#if os(macOS)
  @MainActor
  private func afterTheCurrentEvent(_ work: @escaping @MainActor () -> Void) {
    CFRunLoopPerformBlock(CFRunLoopGetMain(), CFRunLoopMode.defaultMode.rawValue) {
      MainActor.assumeIsolated { work() }
    }
    CFRunLoopWakeUp(CFRunLoopGetMain())
  }
#endif
