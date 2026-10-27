import { vi } from 'vitest'

export function controlledTimeouts() {
  const controllers: AbortController[] = []
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
    const controller = new AbortController()
    controllers.push(controller)
    return controller.signal
  })
  return {
    signals: () => controllers.map(controller => controller.signal),
    lengths: () => timeout.mock.calls.map(([length]) => length),
    expire() {
      for (const controller of controllers)
        controller.abort(new DOMException('The operation timed out.', 'TimeoutError'))
    },
    restore: () => timeout.mockRestore()
  }
}
