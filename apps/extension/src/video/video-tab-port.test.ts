import { describe, expect, it, vi } from 'vitest'
import { videoTabPortsStandIn } from '../test/video-tab-ports'
import type { Playback } from './follower'
import { openVideoTab, type TabPort, videoTabPorts } from './video-tab-port'

const playing = (time: number, changes: Partial<Playback> = {}): Playback => ({
  videoId: 'zenbuJa0001',
  time,
  playing: true,
  rate: 1,
  ad: false,
  ended: false,
  ...changes
})

function tabPort() {
  const posted: unknown[] = []
  const port: TabPort = {
    name: 'video-tab',
    postMessage: message => void posted.push(message),
    disconnect: vi.fn(),
    onDisconnect: { addListener: () => undefined, removeListener: () => undefined }
  }
  return {
    port,
    times: () => posted.map(message => (message as { playback: Playback }).playback?.time)
  }
}

describe('the playback a page sends its Video tabs', () => {
  it('sends steady play at most every 100 ms, and every jump or change at once', () => {
    const clock = { now: 0 }
    const ports = videoTabPorts(() => clock.now)
    const tab = tabPort()
    ports.add(tab.port, playing(0))
    for (const [at, time] of [
      [16, 0.016],
      [33, 0.033],
      [100, 0.1],
      [116, 0.116]
    ]) {
      clock.now = at
      ports.send(playing(time))
    }
    ports.send(playing(30))
    ports.send(playing(30.01, { playing: false }))
    ports.send(playing(30.02, { ad: true, playing: false }))
    ports.send(null)
    expect(tab.times()).toEqual([0, 0.1, 30, 30.01, 30.02, undefined])
  })

  it('is open while a Video tab is, and disconnects each one on closing', () => {
    const ports = videoTabPorts()
    const first = tabPort()
    const second = tabPort()
    expect(ports.open).toBe(false)
    ports.add(first.port, null)
    ports.add(second.port, null)
    ports.remove(first.port)
    expect(ports.open).toBe(true)
    ports.close()
    expect(ports.open).toBe(false)
    expect(second.port.disconnect).toHaveBeenCalledOnce()
    expect(first.port.disconnect).not.toHaveBeenCalled()
  })
})

describe('a Video tab following a page', () => {
  it('waits longer each time no page answers, saying so each time, and connects once one does', async () => {
    const tabs = videoTabPortsStandIn()
    const waits: number[] = []
    const waited: (() => void)[] = []
    const heard: (Playback | null | 'unreachable')[] = []
    const following = {
      playback: (playback: Playback | null) => void heard.push(playback),
      unreachable: () => void heard.push('unreachable')
    }
    const stop = openVideoTab(5, following, {
      connect: tabs.connect,
      lastError: tabs.lastError,
      wait: milliseconds => {
        waits.push(milliseconds)
        return new Promise(resolve => waited.push(resolve))
      }
    })
    await vi.waitFor(() => expect(waits).toEqual([2_000]))
    waited.shift()?.()
    await vi.waitFor(() => expect(waits).toEqual([2_000, 4_000]))
    const page = videoTabPorts()
    tabs.onConnect(5).addListener(port => page.add(port, playing(3)))
    waited.shift()?.()
    await vi.waitFor(() => expect(heard.at(-1)).toEqual(playing(3)))
    expect(heard).toEqual(['unreachable', 'unreachable', playing(3)])
    stop()
    await Promise.resolve()
    page.send(playing(4))
    expect(heard).toEqual(['unreachable', 'unreachable', playing(3)])
  })

  it('hears no playback, without calling the page unreachable, when a page it followed goes', async () => {
    const tabs = videoTabPortsStandIn()
    const heard: (Playback | null | 'unreachable')[] = []
    const page = videoTabPorts()
    tabs.onConnect(5).addListener(port => page.add(port, playing(3)))
    openVideoTab(
      5,
      {
        playback: playback => void heard.push(playback),
        unreachable: () => void heard.push('unreachable')
      },
      { connect: tabs.connect, lastError: tabs.lastError, wait: () => new Promise(() => {}) }
    )
    await vi.waitFor(() => expect(heard).toEqual([playing(3)]))
    page.close()
    await vi.waitFor(() => expect(heard).toEqual([playing(3), null]))
  })

  it('hears nothing more, and stops asking, once it closes', async () => {
    const tabs = videoTabPortsStandIn()
    const wait = vi.fn(() => Promise.resolve())
    const ignore = () => undefined
    const stop = openVideoTab(
      5,
      { playback: ignore, unreachable: ignore },
      {
        connect: tabs.connect,
        lastError: tabs.lastError,
        wait
      }
    )
    stop()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(wait).not.toHaveBeenCalled()
  })
})
