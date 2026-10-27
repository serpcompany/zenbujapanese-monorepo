import type { Caption } from '@zenbu/dictionary-core/captions/lines'
import { describe, expect, it } from 'vitest'
import { currentLine, type Playback, playingLine } from './follower'
import { watchedVideoId } from './watch-page'

const line = (id: number, start: number, end: number): Caption => ({
  id,
  start,
  end,
  text: `line ${id}`,
  translation: null
})

const lines = [line(0, 0.5, 3), line(1, 5.4, 8.5), line(2, 8.5, 10), line(3, 11.2, 13.6)]

describe('currentLine', () => {
  it('finds the line playing at a time, from its start up to its end', () => {
    expect(
      [0.5, 2.9, 5.4, 8.49, 8.5, 9.99, 11.2, 13.5].map(time => currentLine(lines, time))
    ).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
  })

  it('finds no line before the first, between lines, or after the last', () => {
    expect([0, 3, 4, 10, 11.1, 13.6, 60].map(time => currentLine(lines, time))).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ])
    expect(currentLine([], 1)).toBeNull()
  })
})

describe('playingLine', () => {
  const playback: Playback = {
    videoId: 'zenbuJa0001',
    time: 5.4,
    playing: true,
    rate: 1,
    ad: false
  }

  it('gives the line playing in a playback, and none while an ad shows or nothing is followed', () => {
    expect(playingLine(lines, playback)).toBe(1)
    expect(playingLine(lines, { ...playback, playing: false })).toBe(1)
    expect(playingLine(lines, { ...playback, ad: true })).toBeNull()
    expect(playingLine(lines, null)).toBeNull()
  })
})

describe('watchedVideoId', () => {
  it("reads the video of a YouTube watch page and nothing else's", () => {
    expect(watchedVideoId('https://www.youtube.com/watch?v=zenbuJa0001&t=42s')).toBe('zenbuJa0001')
    for (const url of [
      'https://www.youtube.com/',
      'https://www.youtube.com/results?search_query=japanese',
      'https://www.youtube.com/watch?v=short',
      'https://www.youtube.com/watch',
      'https://www.example.com/watch?v=zenbuJa0001',
      'not a url',
      undefined
    ]) {
      expect(watchedVideoId(url)).toBeNull()
    }
  })
})
