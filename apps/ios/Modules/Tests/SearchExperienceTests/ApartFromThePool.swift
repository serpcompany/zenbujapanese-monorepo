import Foundation

func apartFromThePool<Value: Sendable>(
  _ work: @escaping @Sendable () throws -> Value
) async throws -> Value {
  try await withCheckedThrowingContinuation { finished in
    DispatchQueue(label: "com.zenbujapanese.tests.apart-from-the-pool").async {
      finished.resume(with: Result(catching: work))
    }
  }
}
