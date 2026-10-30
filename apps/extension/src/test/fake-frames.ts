export function fakeFrames() {
  const waiting = new Map<number, FrameRequestCallback>()
  let handles = 0
  return {
    waiting,
    requestAnimationFrame(callback: FrameRequestCallback) {
      handles += 1
      waiting.set(handles, callback)
      return handles
    },
    cancelAnimationFrame(handle: number) {
      waiting.delete(handle)
    },
    runFrame() {
      const callbacks = [...waiting.values()]
      waiting.clear()
      for (const callback of callbacks) callback(0)
    }
  }
}

export const mutationsSeen = () => new Promise(resolve => setTimeout(resolve))
