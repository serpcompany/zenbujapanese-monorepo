import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type ClockFollower, clockFollower, clockLines } from '../test/clock-follower'
import { type LineControls, lineControls } from './line-controls'

let clock: ClockFollower
let controls: LineControls

const seconds = (count: number) => vi.advanceTimersByTimeAsync(count * 1000)
const seekTargets = () => clock.seeks.map(seek => seek.to)

async function playingAt(time: number) {
  clock.learnerSeeks(time)
  clock.learnerPlays()
  await seconds(0)
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date']
  })
  clock = clockFollower()
  controls = lineControls(clock.follower, clockLines)
})

afterEach(() => {
  controls.stop()
  clock.follower.stop()
  vi.useRealTimers()
})

describe('previous and next line', () => {
  it('while playing, jump to that line and keep playing', async () => {
    await playingAt(4)
    expect(controls.view()).toMatchObject({ line: 1, playing: true })
    controls.next()
    await seconds(0.5)
    expect(controls.view()).toMatchObject({ line: 2, playing: true })
    controls.previous()
    await seconds(0.5)
    expect(controls.view()).toMatchObject({ line: 1, playing: true })
    controls.previous()
    controls.previous()
    await seconds(0.5)
    expect(seekTargets()).toEqual([8, 3, 1, 1])
    expect(controls.view()).toMatchObject({ line: 0, playing: true })
    await seconds(3)
    expect(controls.view()).toMatchObject({ line: 1, playing: true })
  })

  it('while paused, play just that line and pause again at its end, one seek each', async () => {
    const steps: [() => void, number, number][] = [
      [controls.next, 1, 0],
      [controls.next, 3, 1],
      [controls.next, 8, 2],
      [controls.previous, 3, 1],
      [controls.previous, 1, 0]
    ]
    for (const [step, start, line] of steps) {
      const before = clock.seeks.length
      step()
      await seconds(0.5)
      expect(controls.view()).toMatchObject({ line, playing: true })
      await seconds(5)
      expect(clock.seeks.length - before).toBe(1)
      expect(clock.seeks.at(-1)?.to).toBe(start)
      expect(controls.view()).toMatchObject({ line, playing: false })
      expect(clock.time()).toBeCloseTo(clockLines[line].end, 1)
    }
  })

  it('from before the first line, go to the first line either way', async () => {
    controls.previous()
    await seconds(3)
    expect(seekTargets()).toEqual([1])
    expect(controls.view()).toMatchObject({ line: 0, playing: false })
  })

  it('pause where the learner paused during a played line, and step on from there', async () => {
    controls.next()
    await seconds(1)
    controls.togglePlay()
    await seconds(3)
    expect(controls.view()).toMatchObject({ line: 0, playing: false })
    expect(clock.time()).toBeCloseTo(2, 1)
    controls.next()
    await seconds(5)
    expect(seekTargets()).toEqual([1, 3])
    expect(controls.view()).toMatchObject({ line: 1, playing: false })
  })
})

describe('Repeat line', () => {
  it('seeks back exactly once per line end over 30 seconds, and never twice within 700 ms', async () => {
    await playingAt(3.2)
    controls.toggleRepeat()
    await seconds(30)
    const line = clockLines[1]
    const length = line.end - line.start
    const repetitions = Math.floor((30 - (line.end - 3.2)) / length) + 1
    expect(seekTargets()).toEqual(Array(repetitions).fill(line.start))
    const times = clock.seeks.map(seek => seek.at)
    for (let index = 1; index < times.length; index += 1) {
      expect(times[index] - times[index - 1]).toBeGreaterThan(700)
      expect(times[index] - times[index - 1]).toBeCloseTo(length * 1000, -2)
    }
    expect(controls.view()).toMatchObject({ line: 1, repeating: true, playing: true })
  })

  it('moves to the next and previous line, and to where the learner seeks', async () => {
    await playingAt(4)
    controls.toggleRepeat()
    controls.next()
    await seconds(2.5)
    expect(seekTargets()).toEqual([8, 8])
    expect(controls.view()).toMatchObject({ line: 2, repeating: true })
    controls.previous()
    await seconds(4)
    expect(seekTargets()).toEqual([8, 8, 3, 3])
    clock.learnerSeeks(11)
    await seconds(2.5)
    expect(seekTargets()).toEqual([8, 8, 3, 3, 10])
    expect(controls.view()).toMatchObject({ line: 3, repeating: true })
    controls.seek(8.5)
    await seconds(2)
    expect(seekTargets()).toEqual([8, 8, 3, 3, 10, 8.5, 8])
    expect(controls.view()).toMatchObject({ line: 2, repeating: true })
  })

  it('moves to the line before a gap the learner seeks into, from its start', async () => {
    await playingAt(4)
    controls.toggleRepeat()
    clock.learnerSeeks(7)
    await seconds(0.5)
    expect(seekTargets()).toEqual([3])
    expect(controls.view()).toMatchObject({ line: 1, repeating: true })
  })

  it('turned on while paused, goes to the line start without playing', async () => {
    clock.learnerSeeks(5)
    await seconds(1)
    controls.toggleRepeat()
    await seconds(2)
    expect(seekTargets()).toEqual([3])
    expect(controls.view()).toMatchObject({ line: 1, repeating: true, playing: false })
    controls.togglePlay()
    await seconds(4)
    expect(seekTargets()).toEqual([3, 3])
    controls.toggleRepeat()
    await seconds(5)
    expect(seekTargets()).toEqual([3, 3])
    expect(controls.view()).toMatchObject({ line: 2, repeating: false })
  })

  it('loops the line that ends the video', async () => {
    controls.stop()
    clock.follower.stop()
    clock = clockFollower({ duration: 13 })
    controls = lineControls(clock.follower, clockLines)
    await playingAt(11)
    controls.toggleRepeat()
    await seconds(4)
    expect(seekTargets()).toEqual([10])
    expect(controls.view()).toMatchObject({ line: 3, playing: true })
  })
})

describe('the speed', () => {
  it('chosen while repeating, stays across a line change and an ad', async () => {
    await playingAt(4)
    controls.toggleRepeat()
    controls.setRate(1.5)
    await seconds(1)
    controls.next()
    await seconds(1)
    expect(clock.time()).toBeCloseTo(9.5, 1)
    expect(controls.view()).toMatchObject({ line: 2, rate: 1.5, repeating: true })
    clock.adStarts()
    await seconds(0)
    expect(controls.view()).toMatchObject({ line: null, ad: true, playing: false })
    controls.next()
    controls.toggleRepeat()
    controls.setRate(1)
    await seconds(5)
    clock.adEnds()
    await seconds(1)
    expect(controls.view()).toMatchObject({ line: 2, rate: 1.5, repeating: true, ad: false })
    expect(clock.rates).toEqual([1.5])
    expect(seekTargets()).toEqual([8, 8])
    expect(clock.time()).toBeCloseTo(9, 1)
  })
})

it('follows the caption line, with none between lines or before the first', async () => {
  expect(controls.view()).toMatchObject({ line: null, ready: true })
  await playingAt(6.6)
  expect(controls.view().line).toBeNull()
  await seconds(1.5)
  expect(controls.view().line).toBe(2)
  clock.follower.stop()
  await seconds(0)
  expect(controls.view()).toMatchObject({ line: null, ready: false })
})
