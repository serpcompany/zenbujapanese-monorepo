self.onmessage = event => {
  console.log('[selftest] worker answered ping', event.data)
  self.postMessage(`pong ${event.data}`)
}
