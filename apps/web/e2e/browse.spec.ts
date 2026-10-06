import { expect, needed, test } from './test'

const browse = (path = '') => `/dictionary/browse/${path}`
const kana = (script: string, value: string) => browse(`${script}/${encodeURIComponent(value)}/`)

test.describe('browse pages', () => {
  test('the dictionary home leads into the browse pages', async ({ page }) => {
    await page.goto('/dictionary/')
    const byKana = page.getByRole('region', { name: 'Browse by kana' })
    await expect(byKana.getByRole('link', { name: 'Katakana' })).toHaveAttribute(
      'href',
      browse('katakana/')
    )
    const grades = page.getByRole('region', { name: 'Kanji by school grade' })
    await expect(grades.getByRole('link', { name: /^Grade 1\b/ })).toHaveAttribute(
      'href',
      browse('kanji/grade-1/')
    )
    await expect(grades.getByRole('link', { name: '日', exact: true })).toHaveAttribute(
      'href',
      `/dictionary/search/${encodeURIComponent('日')}/`
    )
    const categories = page.getByRole('region', { name: 'Browse by category' })
    await expect(categories.getByRole('link', { name: 'Onomatopoeia' })).toHaveAttribute(
      'href',
      browse('onomatopoeia/')
    )
    await expect(
      page
        .getByRole('region', { name: 'Common words' })
        .getByRole('link', { name: /^All [\d,]+ common words$/ })
    ).toHaveAttribute('href', browse('common-words/'))
    await byKana.getByRole('link', { name: 'い', exact: true }).click()
    await expect(page).toHaveURL(kana('hiragana', 'い'))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Japanese words starting with い'
    )
  })

  test('the browse hub leads to each kind of list', async ({ page }) => {
    await page.goto(browse())
    await expect(page).toHaveTitle('Browse the Japanese dictionary | Zenbu Japanese')
    for (const [name, path] of [
      ['Hiragana', 'hiragana/'],
      ['Katakana', 'katakana/'],
      ['Kanji', 'kanji/'],
      ['Parts of speech', 'parts-of-speech/'],
      ['Usage labels', 'usage/'],
      ['Subjects', 'subjects/']
    ]) {
      await expect(page.getByRole('link', { name, exact: true }).first()).toHaveAttribute(
        'href',
        browse(path)
      )
    }
    await page.getByRole('link', { name: 'Frequency dictionaries', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Japanese frequency dictionaries'
    )
  })

  test('the kana charts show each kana’s romaji and open its page', async ({ page }) => {
    await page.goto(browse('kana/'))
    const hiragana = page.getByRole('list', { name: 'Hiragana gojūon' })
    await expect(hiragana.getByRole('link', { name: 'し shi' })).toBeVisible()
    await expect(
      page.getByRole('list', { name: 'Katakana gojūon' }).getByRole('link', { name: 'ツ tsu' })
    ).toHaveAttribute('href', kana('katakana', 'ツ'))
    const voiced = page.getByRole('list', { name: 'Hiragana dakuon and handakuon' })
    await expect(voiced.getByRole('link', { name: /^ぢ/ })).toHaveCount(0)
    await expect(voiced.getByText('no words start with it')).toHaveCount(1)
    await expect(hiragana.getByText('no words start with it')).toHaveCount(0)
    await hiragana.getByRole('link', { name: 'い i' }).click()
    await expect(page).toHaveURL(kana('hiragana', 'い'))
  })

  test('a script’s page counts each kana’s words and lists the other kana', async ({ page }) => {
    await page.goto(browse('hiragana/'))
    await expect(page.getByRole('link', { name: /^か, [\d,]+ words$/ })).toHaveAttribute(
      'href',
      kana('hiragana', 'か')
    )
    const others = page.getByRole('list', { name: 'Other kana' })
    await expect(others.getByRole('link', { name: /^っ/ })).toHaveAttribute(
      'href',
      kana('hiragana', 'っ')
    )
    await expect(page.getByRole('navigation', { name: 'Script' })).toContainText('Katakana')
  })

  test('a kana’s page lists its two-kana groups and leads to their words', async ({ page }) => {
    await page.goto(kana('hiragana', 'い'))
    await expect(page.getByRole('navigation', { name: 'Kana' }).getByText('い')).toHaveAttribute(
      'aria-current',
      'page'
    )
    await expect(page.getByRole('main').getByRole('link', { name: 'Katakana' })).toHaveAttribute(
      'href',
      kana('katakana', 'イ')
    )
    await page
      .getByRole('list', { name: 'Two-kana groups' })
      .getByRole('link', { name: /^いる/ })
      .click()
    await expect(page).toHaveURL(kana('hiragana', 'いる'))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Japanese words starting with いる'
    )
    const trail = page.getByRole('navigation', { name: 'breadcrumb' })
    await expect(trail.getByRole('link', { name: 'Hiragana' })).toHaveAttribute(
      'href',
      browse('hiragana/')
    )
    await expect(trail.getByRole('link', { name: 'い', exact: true })).toBeVisible()
    await page.getByRole('link', { name: /^要 い る to be needed/ }).click()
    await expect(page).toHaveURL(needed.path)
  })

  test('a category lists its words most used first, a page at a time', async ({ page }) => {
    await page.goto(browse('parts-of-speech/'))
    await page.getByRole('link', { name: /^Ichidan verbs/ }).click()
    await expect(page).toHaveURL(browse('ichidan-verbs/'))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Japanese ichidan verbs')
    const order = page.getByRole('navigation', { name: 'Order' })
    await expect(order.getByText('Most used')).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('[data-section="words"]')).toContainText('てる')
    await page
      .getByRole('navigation', { name: 'Pages' })
      .getByRole('link', { name: '2', exact: true })
      .click()
    await expect(page).toHaveURL(browse('ichidan-verbs/2/'))
    await expect(page).toHaveTitle('Japanese ichidan verbs, page 2 | Zenbu Japanese')
    await page
      .getByRole('navigation', { name: 'Order' })
      .getByRole('link', { name: 'Kana order' })
      .click()
    await expect(page).toHaveURL(browse('ichidan-verbs/kana-order/'))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Japanese ichidan verbs')
  })

  test('the kanji lists open each kanji’s search page', async ({ page }) => {
    await page.goto(browse('kanji/'))
    await expect(
      page.getByRole('list', { name: 'Grade 1 kanji' }).getByRole('link', { name: '日' })
    ).toHaveAttribute('href', `/dictionary/search/${encodeURIComponent('日')}/`)
    await expect(
      page.getByRole('list', { name: 'Stroke counts' }).getByRole('link')
    ).not.toHaveCount(0)
    await page.goto(browse('kanji/grade-4/'))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grade 4 kanji')
    await page.getByRole('link', { name: /^要/ }).click()
    await expect(page).toHaveURL(`/dictionary/search/${encodeURIComponent('要')}/`)
  })

  test('the frequency dictionaries lead to each list, and credit Jiten under CC BY-SA', async ({
    page
  }) => {
    await page.goto(browse('frequency-dictionaries/'))
    for (const name of ['YouTube', 'Wikipedia', 'TV and movies', 'Anime', 'Video games']) {
      await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
    }
    await expect(page.getByRole('link', { name: /^N5/ })).toHaveAttribute(
      'href',
      browse('frequency-dictionaries/jlpt-n5/')
    )
    await page.getByRole('heading', { level: 2, name: 'Anime' }).getByRole('link').click()
    await expect(page).toHaveURL(browse('frequency-dictionaries/anime/'))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Most used Japanese words: Anime'
    )
    const main = page.getByRole('main')
    await expect(main).toContainText('Ranks 1 to 200.')
    await expect(
      main
        .locator('[data-section="words"]')
        .getByText(/^#\d+$/)
        .first()
    ).toBeVisible()
    await expect(main.getByRole('link', { name: 'Jiten' })).toBeVisible()
    await expect(main).toContainText('CC BY-SA 4.0')
    await expect(main).toContainText('shared under the same licence')
  })

  test('a long breadcrumb trail wraps rather than overlapping', async ({ page }) => {
    await page.goto(browse('frequency-dictionaries/anime/'))
    const crumbs = page.getByRole('navigation', { name: 'breadcrumb' }).getByRole('listitem')
    await expect(crumbs).toHaveCount(5)
    const overflowing = await crumbs.evaluateAll(items =>
      items.filter(item => item.scrollWidth > item.clientWidth).map(item => item.textContent)
    )
    expect(overflowing).toEqual([])
  })

  test('the sitemap page lists the browse pages', async ({ page }) => {
    await page.goto('/sitemap/')
    for (const [name, path] of [
      ['Browse', ''],
      ['Kana charts', 'kana/'],
      ['Kanji lists', 'kanji/'],
      ['Grade 1', 'kanji/grade-1/'],
      ['Frequency dictionaries', 'frequency-dictionaries/'],
      ['Anime', 'frequency-dictionaries/anime/'],
      ['Parts of speech', 'parts-of-speech/'],
      ['Common words', 'common-words/']
    ]) {
      await expect(page.getByRole('main').getByRole('link', { name, exact: true })).toHaveAttribute(
        'href',
        browse(path)
      )
    }
  })
})

test.describe('browse URLs', () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop',
      'A redirect or status is the same at every width'
    )
  })

  test('a list’s first page has no number, and a page past its last is 404', async ({
    request,
    baseURL
  }) => {
    const first = await request.get(browse('ichidan-verbs/1/'), { maxRedirects: 0 })
    expect(first.status()).toBe(308)
    expect(new URL(first.headers().location, baseURL).pathname).toBe(browse('ichidan-verbs/'))
    for (const path of [
      browse('ichidan-verbs/9999/'),
      browse('ichidan-verbs/10001/'),
      browse('no-such-category/2/'),
      browse('no-such-category/1/'),
      browse('kana/1/'),
      `${kana('hiragana', 'ぁぁ')}1/`,
      browse('no-such-category/'),
      browse('kanji/grade-9/'),
      kana('katakana', 'か')
    ]) {
      expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(404)
    }
  })
})
