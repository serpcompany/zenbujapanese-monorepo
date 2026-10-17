import Testing

@MainActor
private final class Looks {
  var count = 0
}

@MainActor
@Suite("Waiting on observed state", .timeLimit(.minutes(1)))
struct UntilTests {
  @Test("a wait ends when its task is cancelled while it waits, so a time limit can stop it")
  func endsWhenCancelled() async {
    let looks = Looks()
    let waiting = Task {
      await until {
        looks.count += 1
        return false
      }
    }
    while looks.count == 0 { await Task.yield() }
    waiting.cancel()
    await waiting.value
  }
}
