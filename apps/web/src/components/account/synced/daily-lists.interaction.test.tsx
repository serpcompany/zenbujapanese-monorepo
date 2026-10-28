import { dailyListId } from '@zenbu/account-rules/daily-lists'
import { afterEach, describe, expect, test } from 'vitest'
import { localDay } from '@/lib/account/daily-lists'
import { click, shows, unmount } from '@/test/account-page'
import { food, list, miru, onList, openArea, taberu, verbs, word } from '@/test/synced-page'
import { SyncedStandIn } from '@/test/synced-stand-in'

afterEach(unmount)

const anime = '0b5e8f3a-7c21-4d9e-8f60-2a4b6c8d0e1f'

function dayId(daysAgo: number) {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return dailyListId(localDay(date)) ?? ''
}

const today = dayId(0)
const yesterday = dayId(1)
const daily = [today, yesterday]

const threeOwnAndTwoDaily = () =>
  new SyncedStandIn()
    .holds('list', food, list(food, 'Food', 1))
    .holds('list', today, list(today, 'Stored name of today', 0))
    .holds('list', verbs, list(verbs, 'Verbs', 3))
    .holds('list', yesterday, list(yesterday, 'Stored name of yesterday', 2))
    .holds('list', anime, list(anime, 'Anime', 4))
    .holds('listWord', `${today}/${word(1)}`, onList(today, word(1), miru, '2026-10-01T00:00:00Z'))
    .holds(
      'listWord',
      `${today}/${word(2)}`,
      onList(today, word(2), taberu, '2026-10-02T00:00:00Z')
    )

const titles = (page: HTMLElement, within = '') =>
  [...page.querySelectorAll(`${within} [data-slot="item-title"] a`)].map(link => [
    link.textContent,
    link.getAttribute('href')
  ])

describe('daily lists on the Lists page', () => {
  test('Lists shows the three own lists, and Daily Lists with 2 at the top', async () => {
    const { page } = openArea('lists', threeOwnAndTwoDaily())
    await shows(page, 'Daily Lists')
    expect(titles(page)).toEqual([
      ['Daily Lists', '/account/lists/?view=daily'],
      ['Food', `/account/lists/?list=${food}`],
      ['Verbs', `/account/lists/?list=${verbs}`],
      ['Anime', `/account/lists/?list=${anime}`]
    ])
    expect(page.querySelector('[data-slot="item"]')?.textContent).toContain('2 lists')
    expect(page.textContent).not.toContain('Stored name')
  })

  test('the Daily Lists page lists both under This week, newest first, and one opens its words', async () => {
    const { page } = openArea('lists', threeOwnAndTwoDaily(), { dailyLists: true })
    await shows(page, 'This week')
    const week = page.querySelector('section[aria-label="This week"]')
    expect(week?.querySelector('h3')?.textContent).toBe('This week')
    expect(titles(page, 'section[aria-label="This week"]')).toEqual([
      ['Today', `/account/lists/?list=${today}`],
      ['Yesterday', `/account/lists/?list=${yesterday}`]
    ])
    expect(week?.textContent).toContain('2 words')
    expect(week?.textContent).toContain('0 words')
    expect(page.textContent).not.toContain('Food')
    unmount()
    const opened = openArea('lists', threeOwnAndTwoDaily(), { listId: today }).page
    await shows(opened, '食べる（たべる）')
    expect(opened.textContent).toContain('見る（みる）')
  })

  test('says so when the account has no daily list', async () => {
    const standIn = new SyncedStandIn().holds('list', food, list(food, 'Food', 0))
    const { page } = openArea('lists', standIn, { dailyLists: true })
    await shows(page, 'You have no daily lists yet.')
    expect(titles(page)).toEqual([])
    unmount()
    const lists = openArea('lists', new SyncedStandIn().holds('list', food, list(food, 'Food', 0)))
    await shows(lists.page, 'Food')
    expect(lists.page.textContent).not.toContain('Daily Lists')
  })

  test('moving an own list never moves a daily one', async () => {
    const { page, standIn } = openArea('lists', threeOwnAndTwoDaily())
    await shows(page, 'Verbs')
    await click(page, 'Move Food down')
    await shows(page, 'Food')
    await click(page, 'Move Anime up')
    await shows(page, 'Anime')
    expect(titles(page).map(([name]) => name)).toEqual(['Daily Lists', 'Verbs', 'Anime', 'Food'])
    const moved = standIn.sent.map(each => each.entityId)
    expect(moved.length).toBeGreaterThan(0)
    expect(moved.filter(id => daily.includes(id))).toEqual([])
  })
})
