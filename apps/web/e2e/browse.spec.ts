import { expect, needed, sourcesToggle, test } from './test'

const browse = (path = '') => `/dictionary/browse/${path}`
const kana = (script: string, value: string) => browse(`${script}/${encodeURIComponent(value)}/`)
const search = (query: string) => `/dictionary/search/${encodeURIComponent(query)}/`

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
      search('日')
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
    await expect(
      page.getByRole('list', { name: 'Kanji lists' }).getByRole('link', { name: 'JLPT N5' })
    ).toHaveAttribute('href', browse('kanji/jlpt-n5/'))
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

  test('a two-kana group leads to the groups before and after it', async ({ page }) => {
    await page.goto(kana('hiragana', 'いる'))
    const neighbors = page.getByRole('navigation', { name: 'Neighboring groups' })
    await expect(neighbors.getByRole('link', { name: '← いり' })).toHaveAttribute(
      'href',
      kana('hiragana', 'いり')
    )
    await expect(neighbors.getByRole('link', { name: 'いれ →' })).toHaveAttribute(
      'href',
      kana('hiragana', 'いれ')
    )
    await expect(neighbors.getByText('いる', { exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  test('the kanji lists open each kanji’s search page', async ({ page }) => {
    await page.goto(browse('kanji/'))
    await expect(
      page.getByRole('list', { name: 'Grade 1 kanji' }).getByRole('link', { name: '日' })
    ).toHaveAttribute('href', search('日'))
    await expect(
      page.getByRole('list', { name: 'Stroke counts' }).getByRole('link')
    ).not.toHaveCount(0)
    await page.goto(browse('kanji/grade-4/'))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grade 4 kanji')
    await page.getByRole('link', { name: /^要/ }).click()
    await expect(page).toHaveURL(search('要'))
  })

  test('the JLPT kanji lists are Waller’s, credited under CC BY', async ({ page }) => {
    await page.goto(browse('kanji/'))
    await expect(page).toHaveTitle(
      'Kanji lists by school grade, JLPT level, and stroke count | Zenbu Japanese'
    )
    const levels = page.getByRole('region', { name: 'By JLPT level' })
    await expect(levels.getByRole('link')).toHaveCount(5)
    await expect(levels.getByRole('link', { name: /^JLPT N1/ })).toHaveAttribute(
      'href',
      browse('kanji/jlpt-n1/')
    )
    await expect(levels).toContainText('estimates')
    await levels.getByRole('link', { name: /^JLPT N5/ }).click()
    await expect(page).toHaveURL(browse('kanji/jlpt-n5/'))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('JLPT N5 kanji')
    const main = page.getByRole('main')
    await expect(main).toContainText('The 79 kanji Jonathan Waller lists for JLPT N5')
    await expect(
      page.getByRole('navigation', { name: 'Kanji lists' }).getByRole('link', { name: 'JLPT N4' })
    ).toHaveAttribute('href', browse('kanji/jlpt-n4/'))
    await sourcesToggle(page).click()
    await expect(main.getByRole('link', { name: 'JLPT kanji levels' })).toBeVisible()
    await expect(main).toContainText('CC BY')
    await main.getByRole('link', { name: /^日/ }).click()
    await expect(page).toHaveURL(search('日'))
  })

  test('a compatibility kanji keeps its glyph, with its base kanji’s meaning and search', async ({
    page
  }) => {
    await page.goto(browse('kanji/jinmeiyo/'))
    const variant = page.getByRole('main').getByRole('link', { name: /^\u{FA45} sea$/u })
    await expect(variant).toHaveAttribute('href', search('海'))
  })

  test('a browse page is one column, at most 1,024 pixels wide', async ({ page }) => {
    await page.goto(browse())
    const main = await page.getByRole('main').boundingBox()
    const viewport = page.viewportSize()
    if (!main || !viewport) throw new Error('The page has no main column')
    expect(main.width).toBeCloseTo(Math.min(1_024, viewport.width), 0)
  })

  test('a long breadcrumb trail wraps rather than overlapping', async ({ page }) => {
    await page.goto(browse('frequency-dictionaries/anime/1-1000/'))
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
      ['JLPT N5 kanji', 'kanji/jlpt-n5/'],
      ['Frequency dictionaries', 'frequency-dictionaries/'],
      ['JLPT N5 vocabulary', 'frequency-dictionaries/jlpt/n5/'],
      ['Anime', 'frequency-dictionaries/anime/1-1000/'],
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

  test('a list’s first page has no number, and a page or list the dictionary lacks is 404', async ({
    request,
    baseURL
  }) => {
    for (const [from, to] of [
      ['ichidan-verbs/1/', 'ichidan-verbs/'],
      ['ichidan-verbs/kana-order/1/', 'ichidan-verbs/kana-order/'],
      ['frequency-dictionaries/jlpt/n5/1/', 'frequency-dictionaries/jlpt/n5/']
    ]) {
      const response = await request.get(browse(from), { maxRedirects: 0 })
      expect(response.status(), from).toBe(308)
      expect(new URL(response.headers().location, baseURL).pathname).toBe(browse(to))
    }
    for (const path of [
      browse('ichidan-verbs/9999/'),
      browse('ichidan-verbs/10001/'),
      browse('no-such-category/2/'),
      browse('no-such-category/1/'),
      browse('no-such-category/kana-order/'),
      browse('kana/1/'),
      `${kana('hiragana', 'ぁぁ')}1/`,
      browse('no-such-category/'),
      browse('kanji/grade-9/'),
      kana('katakana', 'か'),
      browse('frequency-dictionaries/anime/'),
      browse('frequency-dictionaries/anime/2/'),
      browse('frequency-dictionaries/anime/1001-1999/'),
      browse('frequency-dictionaries/anime/10001-11000/'),
      browse('frequency-dictionaries/jlpt-n5/'),
      browse('frequency-dictionaries/jlpt/'),
      browse('frequency-dictionaries/jlpt/n6/')
    ]) {
      expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(404)
    }
  })
})
