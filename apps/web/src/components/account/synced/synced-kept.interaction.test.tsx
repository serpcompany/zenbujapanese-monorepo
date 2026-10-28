import { afterEach, describe, expect, test, vi } from 'vitest'
import { click, fill, refusal, shows, unmount } from '@/test/account-page'
import { miru, openArea, word } from '@/test/synced-page'
import { SyncedStandIn } from '@/test/synced-stand-in'

afterEach(unmount)

function SeenAtOnce(seen: (entries: { isIntersecting: boolean; target: Element }[]) => void) {
  return {
    observe: (target: Element) => {
      if (target.tagName === 'DIV') seen([{ isIntersecting: true, target }])
    },
    unobserve: () => undefined,
    disconnect: () => undefined
  }
}

const photosSeenAtOnce = () => {
  vi.stubGlobal('IntersectionObserver', SeenAtOnce)
  URL.createObjectURL = vi.fn(() => 'blob:menu')
  URL.revokeObjectURL = vi.fn()
}

const note = '0b9a0c7e-3b5d-4c2e-9a8f-1d2e3f4a5b6c'
const lost = '1b9a0c7e-3b5d-4c2e-9a8f-1d2e3f4a5b6c'
const earlier = `wn1:${'a'.repeat(64)}`

const notes = () =>
  new SyncedStandIn()
    .holds('wordNote', note, { id: note, itemId: word(1), text: 'Seen on a menu.', ...miru })
    .holds('wordNote', lost, { id: lost, itemId: earlier, text: 'Kept.', headword: '閻魔' })

describe('Notes', () => {
  test("changes a note's text, holding it to the rule, and asks before deleting one", async () => {
    const { page, standIn } = openArea('notes', notes())
    await shows(page, 'Seen on a menu.')
    await click(page, 'Edit your note on 見る（みる）')
    await fill(page, 'Note', '  ')
    await click(page, 'Save')
    await shows(page, 'A note is 1 to 10,000 characters.')
    await fill(page, 'Note', 'Seen on a menu in Kyoto.')
    await click(page, 'Save')
    await shows(page, 'Seen on a menu in Kyoto.')
    expect(standIn.sent).toMatchObject([
      {
        entity: 'wordNote',
        operation: 'write',
        entityId: note,
        baseVersion: 1,
        fields: {
          item: word(1),
          text: 'Seen on a menu in Kyoto.',
          headword: '見る',
          reading: 'みる'
        }
      }
    ])
    await click(page, 'Delete your note on 見る（みる）')
    await shows(page, 'Delete this note? It can’t be brought back.')
    await click(page, 'Delete Note')
    await vi.waitFor(() => expect(page.textContent).not.toContain('Kyoto'))
  })

  test('keeps the learner’s text as a new note when the note changed elsewhere first', async () => {
    const standIn = notes()
    const { page } = openArea('notes', standIn)
    await shows(page, 'Seen on a menu.')
    standIn.holds(
      'wordNote',
      note,
      { id: note, itemId: word(1), text: 'Changed in the app.', ...miru },
      2
    )
    await click(page, 'Edit your note on 見る（みる）')
    await fill(page, 'Note', 'Changed here.')
    await click(page, 'Save')
    await shows(page, 'yours is kept as a new note beside it')
    expect(page.textContent).toContain('Changed in the app.')
    expect(page.textContent).toContain('Changed here.')
  })

  test('keeps both texts when another device changed a note after its edit began, though the page read the change before Save', async () => {
    const standIn = notes()
    const { page } = openArea('notes', standIn)
    await shows(page, 'Seen on a menu.')
    await click(page, 'Edit your note on 見る（みる）')
    await fill(page, 'Note', 'Changed here.')
    standIn.holds(
      'wordNote',
      note,
      { id: note, itemId: word(1), text: 'Changed in the app.', ...miru },
      2
    )
    await click(page, 'Delete your note on 閻魔')
    await click(page, 'Delete Note')
    await vi.waitFor(() => expect(page.textContent).not.toContain('Notes Without a Word'))
    await click(page, 'Save')
    await shows(page, 'yours is kept as a new note beside it')
    expect(standIn.sent.at(-2)).toMatchObject({ entityId: note, baseVersion: 1 })
    expect(page.textContent).toContain('Changed in the app.')
    expect(page.textContent).toContain('Changed here.')
  })

  test('lists a note whose word has no page under Notes Without a Word, with the word it was saved on, to copy or delete', async () => {
    const copied = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: copied } })
    const { page } = openArea('notes', notes())
    await shows(page, 'Notes Without a Word')
    const without = page.querySelector('[aria-labelledby="notes-without-a-word"]')
    expect(without?.textContent).toContain('Saved on 閻魔')
    expect(without?.textContent).not.toContain('Edit')
    await click(page, 'Copy your note on 閻魔')
    expect(copied).toHaveBeenCalledWith('Kept.')
  })

  test('lists a note on a word or kanji a dictionary update dropped under Notes Without a Word too, and links the others to their pages', async () => {
    const dropped = '2b9a0c7e-3b5d-4c2e-9a8f-1d2e3f4a5b6c'
    const onKanji = '3b9a0c7e-3b5d-4c2e-9a8f-1d2e3f4a5b6c'
    const standIn = notes()
      .holds('wordNote', dropped, {
        id: dropped,
        itemId: word(2),
        text: 'An old name.',
        headword: '貞はる',
        reading: 'さだはる'
      })
      .holds('wordNote', onKanji, { id: onKanji, itemId: 'kanji:丢', text: 'Lost.' })
      .hasPage(word(1), '/dictionary/見る-1259290/')
    const { page } = openArea('notes', standIn)
    await shows(page, 'Notes Without a Word')
    const onWords = page.querySelector('section[aria-label="Notes"]')
    expect(onWords?.textContent).toContain('Seen on a menu.')
    expect(onWords?.textContent).not.toContain('An old name.')
    expect(onWords?.querySelector('a')?.getAttribute('href')).toBe('/dictionary/見る-1259290/')
    const without = page.querySelector('[aria-labelledby="notes-without-a-word"]')
    expect(without?.textContent).toContain('An old name.')
    expect(without?.textContent).toContain('Saved on 貞はる（さだはる）')
    expect(without?.textContent).toContain('Lost.')
    expect(without?.textContent).toContain('Kept.')
    expect(without?.querySelector('a')).toBeNull()
    expect(standIn.pagesAsked.sort()).toEqual([word(1), word(2), 'kanji:丢'])
  })
})

describe('Recent searches', () => {
  const searches = () =>
    new SyncedStandIn()
      .holds('recentSearch', 's1', {
        id: 's1',
        query: '猫',
        searchedAt: '2026-10-01T00:00:00.000Z'
      })
      .holds('recentSearch', 's2', {
        id: 's2',
        query: 'cat',
        searchedAt: '2026-10-02T00:00:00.000Z'
      })

  test('lists them newest first, linked to their search, removes one, and clears the rest after asking', async () => {
    const { page, standIn } = openArea('recentSearches', searches())
    await shows(page, 'cat')
    const links = [...page.querySelectorAll('[data-slot="item-title"] a')]
    expect(links.map(link => [link.textContent, link.getAttribute('href')])).toEqual([
      ['cat', '/dictionary/search/cat/'],
      ['猫', '/dictionary/search/%E7%8C%AB/']
    ])
    await click(page, 'Remove cat')
    await vi.waitFor(() => expect(page.textContent).not.toContain('cat'))
    await click(page, 'Clear All')
    await shows(page, 'Clear your 1 recent search?')
    await click(page, 'Clear')
    await shows(page, 'No recent searches yet.')
    expect(standIn.sent.map(each => [each.operation, each.entityId])).toEqual([
      ['remove', 's2'],
      ['remove', 's1']
    ])
  })

  test('picking one searches it again, as the app does, so it goes up as the newest', async () => {
    vi.stubEnv('ZENBU_ACCOUNT_PAGES', 'open')
    vi.stubEnv('ZENBU_ACCOUNT_SERVICE', 'https://api.example.com')
    const stay = (event: Event) => event.preventDefault()
    document.addEventListener('click', stay)
    try {
      const { page } = openArea('recentSearches', searches())
      await shows(page, 'cat')
      page.querySelector<HTMLAnchorElement>('[data-slot="item-title"] a')?.click()
      expect(window.sessionStorage.getItem('search.asked')).toBe('cat')
    } finally {
      document.removeEventListener('click', stay)
      vi.unstubAllEnvs()
      window.sessionStorage.clear()
    }
  })
})

describe('Settings', () => {
  test("shows the app's own frequency dictionaries until chosen, then sets the account's in their order", async () => {
    const { page, standIn } = openArea(
      'settings',
      new SyncedStandIn().holds('setting', 'readingAids.romaji', {
        name: 'readingAids.romaji',
        value: true
      })
    )
    await shows(page, 'the app uses its own')
    await click(page, 'Use Anime')
    await vi.waitFor(() => expect(standIn.sent).toHaveLength(1))
    expect(standIn.sent.at(-1)).toMatchObject({
      entity: 'setting',
      operation: 'set',
      entityId: 'frequencyDictionaries.chosen',
      baseVersion: 0,
      fields: {
        value:
          'zenbu.jlpt.waller.levels,zenbu.tubelex.youtube.ja.unidic-3.1,zenbu.jiten.anime.ja.ordered-v2'
      }
    })
    await click(page, 'Move Anime up')
    await vi.waitFor(() => expect(standIn.sent).toHaveLength(2))
    await click(page, 'Stop using JLPT Levels')
    await vi.waitFor(() => expect(standIn.sent).toHaveLength(3))
    expect(standIn.dataOf('setting', 'frequencyDictionaries.chosen')).toMatchObject({
      value: 'zenbu.jiten.anime.ja.ordered-v2,zenbu.tubelex.youtube.ja.unidic-3.1'
    })
    const app = page.querySelector('[aria-labelledby="app-settings"]')
    expect(app?.textContent).toContain('Romaji')
    expect(app?.textContent).toContain('On')
    expect(app?.querySelector('button')).toBeNull()
  })
})

describe('what only the app changes, shown as it is', () => {
  test('the Media Library: each photo, its file, when it was saved, and the words it is on', async () => {
    const photo = 'f'.repeat(64)
    const standIn = new SyncedStandIn()
      .holds('photo', photo, { id: photo, name: 'Menu.jpg', savedAt: '2026-10-01T12:00:00.000Z' })
      .holds('photoWord', `${photo}/${word(1)}`, { photoId: photo, itemId: word(1), ...miru })
    photosSeenAtOnce()
    const { page } = openArea('mediaLibrary', standIn, {
      more: {
        [`GET /v1/photos/${photo}`]: new Response(new Uint8Array([0xff, 0xd8]), {
          headers: { 'content-type': 'image/jpeg' }
        })
      }
    })
    await shows(page, 'Menu.jpg')
    await vi.waitFor(() => expect(page.querySelector('img')?.getAttribute('alt')).toBe('Menu.jpg'))
    expect(page.textContent).toContain('Saved October 1, 2026')
    expect(page.querySelector('[data-slot="item-content"] li a')?.textContent).toBe('見る（みる）')
    expect(page.querySelector('button')).toBeNull()
  })

  test('a photo whose file the account lost says so', async () => {
    const photo = 'e'.repeat(64)
    const standIn = new SyncedStandIn().holds('photo', photo, {
      id: photo,
      name: 'Lost.jpg',
      savedAt: '2026-10-01T12:00:00.000Z'
    })
    photosSeenAtOnce()
    const { page } = openArea('mediaLibrary', standIn, {
      more: { [`GET /v1/photos/${photo}`]: refusal(404, 'photo_file_missing') }
    })
    await shows(page, 'This photo’s file isn’t in your account.')
  })

  test("Player's Recent and Translate's bookmarks, newest first, with nothing to change", async () => {
    const standIn = new SyncedStandIn()
      .holds('watchedVideo', 'aaaaaaaaaaa', {
        videoId: 'aaaaaaaaaaa',
        title: 'Older',
        watchedAt: '2026-10-01T00:00:00.000Z'
      })
      .holds('watchedVideo', 'bbbbbbbbbbb', {
        videoId: 'bbbbbbbbbbb',
        title: 'Newer',
        author: 'A channel',
        position: 75,
        duration: 3725,
        watchedAt: '2026-10-02T00:00:00.000Z'
      })
      .holds('bookmarkedSentence', 'b1', {
        id: 'b1',
        text: 'はい。',
        translation: 'Yes.',
        language: 'ja',
        bookmarkedAt: '2026-10-01T12:00:00.000Z'
      })
    const videos = openArea('recentVideos', standIn).page
    await shows(videos, 'Newer')
    const titles = [...videos.querySelectorAll('[data-slot="item-title"] a')]
    expect(titles.map(link => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Newer', 'https://www.youtube.com/watch?v=bbbbbbbbbbb'],
      ['Older', 'https://www.youtube.com/watch?v=aaaaaaaaaaa']
    ])
    expect(videos.textContent).toContain('1:15 of 1:02:05')
    unmount()
    const bookmarks = openArea('bookmarks', standIn).page
    await shows(bookmarks, 'はい。')
    expect(bookmarks.textContent).toContain('Yes.')
    expect(bookmarks.textContent).toContain('Japanese · Bookmarked October 1, 2026')
    expect(bookmarks.querySelector('button')).toBeNull()
  })
})
