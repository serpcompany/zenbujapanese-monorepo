import type { Page } from '@playwright/test'
import { expect, test } from './test'

async function sectionText(page: Page, heading: string) {
  const title = page
    .getByRole('main')
    .getByRole('heading', { level: 2, name: heading, exact: true })
  await expect(title).toBeVisible()
  return title.evaluate(element => {
    const parts: string[] = []
    let next = element.nextElementSibling
    while (next && next.tagName !== 'H2') {
      parts.push(next.textContent ?? '')
      next = next.nextElementSibling
    }
    return parts.join(' ').replace(/\s+/g, ' ')
  })
}

async function expectNamed(page: Page, heading: string, terms: string[]) {
  const text = (await sectionText(page, heading)).toLowerCase()
  const missing = terms.filter(term => !text.includes(term.toLowerCase()))
  expect(missing, `The "${heading}" section doesn't name these`).toEqual([])
}

const listItems = (page: Page, holding: string) =>
  page.getByRole('main').getByRole('list').filter({ hasText: holding }).getByRole('listitem')

test.describe('privacy policy', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/legal/privacy/')
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible()
  })

  test('names what a Zenbu account keeps, and that signed out the apps send it nothing', async ({
    page
  }) => {
    await expectNamed(page, 'The short version', [
      "doesn't track you, and collects no data unless you sign in to a Zenbu account",
      'everything in it works on your device without an account',
      'if you create or sign in to a Zenbu account where our apps or this website offer one',
      'delete the account when you ask it to',
      'only the cookies signing in needs'
    ])
    await expect(listItems(page, 'How you sign in:')).toHaveText([
      /^Your account: a Zenbu user ID; your email and whether it's verified; a name and a username, both optional; the address of your profile picture/,
      /^How you sign in: for each way you sign in \(Apple, Google, or a code we email you\), the provider and your account ID with it\. We don't keep Apple's or Google's own sign-in tokens\./,
      /^Where you're signed in: a session for each device or browser you sign in on, with its IP address and user agent/,
      /^The study data you sync: your known words.*your lists' names, their order, and the words in them; from the iPhone app, your watch history.*a record of each item's latest change.*the result of each sync request/
    ])
    await expectNamed(page, 'Your Zenbu account', [
      "You'll never need a Zenbu account",
      'signed out, our apps send nothing to our account service',
      'encrypted copy of each code',
      'keeping each count for a day',
      "aren't synced: they stay on your device",
      'and to confirm that your account was deleted'
    ])
  })

  test('names the watch history the iPhone app syncs, and that only it reads it', async ({
    page
  }) => {
    await expectNamed(page, 'The short version', [
      'the known words, lists, watch history, and bookmarked translations you sync'
    ])
    await expectNamed(page, 'Your Zenbu account', [
      'from the iPhone app, your watch history: the 50 YouTube videos you most recently watched in its Player',
      'YouTube video ID, title, and channel, its length, where you stopped, how much of its captions you know, and when you last watched it',
      'keeps only its YouTube video ID and when it went, for the latest 100',
      'the result of each sync request, which names the item it changed and when'
    ])
    await expectNamed(page, 'Information in the app', ["Player's watch history"])
    await expectNamed(page, 'Your account on this website', [
      "It can't read your watch history or the sentences you bookmark"
    ])
  })

  test('names the Translate sentences a learner bookmarks, and keeps conversations on the device', async ({
    page
  }) => {
    await expectNamed(page, 'Your Zenbu account', [
      'the Translate sentences you bookmark, each with its text and its translation, which language it was said in, and when you bookmarked it',
      'may be what someone else said, but only sentences you bookmark, never a whole conversation',
      'for a bookmark you removed, only its ID',
      'for one bookmarked before the app synced bookmarks, when it was said',
      'with a one-way fingerprint of what the request sent'
    ])
    await expectNamed(page, 'Information in the app', [
      "the conversation's text and its translations stay on your device until you delete them, and are never sent to us",
      'only the ones you bookmark leave your device',
      'the sentences you bookmark, before or after signing in, sync to it'
    ])
  })

  test('names Tomodachi and the only things it can do with the account', async ({ page }) => {
    await expectNamed(page, 'Tomodachi', [
      'works without an account',
      'study progress in your iCloud account',
      'covers what Tomodachi does with a Zenbu account',
      'none of it is added to your account'
    ])
    await expect(listItems(page, 'read your known words')).toHaveText([
      'read your lists;',
      'read your known words;',
      'mark words Known, but never clear a Known mark;',
      'delete your account when you ask it to, after you sign in to it again;',
      'fetch word cards from our dictionary service, and send it answers you type to split them into words.'
    ])
  })

  test('names what the website can do with the account, and each thing signing in keeps in the browser', async ({
    page
  }) => {
    await expect(listItems(page, 'sign you out of this browser')).toHaveText([
      'show your email, and show and change your name and username;',
      'show how you sign in, and add or remove a way to sign in;',
      'sign you out of this browser;',
      'delete your account.'
    ])
    await expectNamed(page, 'Your account on this website', [
      'once zenbujapanese.com offers sign-in, you can create or sign in to your Zenbu account there with a code we email you, and with Apple or Google where its sign-in page offers them',
      "doesn't read or change your known words or lists yet",
      'only when you open your account page or start to sign in',
      'pointing at or tabbing to a Sign in with Apple button gets it ready',
      "loads Apple's Sign in with Apple script from Apple",
      'goes to Google and comes back through our account service'
    ])
    await expect(listItems(page, 'keeps you signed in')).toHaveText([
      /^__Secure-zenbu\.session_token keeps you signed in\..*lasts 60 days from the last time you use it, or until you sign out or delete your account\.$/,
      /^__Secure-zenbu\.state, only while you sign in with Google, .*lasts 5 minutes/
    ])
    await expectNamed(page, 'This website', [
      'sets them for api.zenbujapanese.com, so your browser sends them only there',
      "the website's pages can't read them",
      "a note in your browser's local storage that you signed in",
      "while you confirm it's you with Google, it keeps in that tab's session storage",
      'sign that earlier session out',
      'never sent to us'
    ])
  })

  test('names where account data is kept and who processes it', async ({ page }) => {
    await expectNamed(page, 'Where account data is kept', [
      'database on our API servers',
      'pass through Cloudflare',
      'backed up each night to private Cloudflare R2 storage',
      'each backup is deleted after 30 days',
      'If you sign in with Apple or Google, that company signs you in under its own terms'
    ])
    await expect(listItems(page, 'hosts our API servers')).toHaveText([
      /^Cloudflare, which carries traffic to our servers and stores the backups/,
      /^useSend, which sends our email, and so gets your email address and each message we send you/,
      /^the company that hosts our API servers/
    ])
  })

  test('says how long account data is kept, how to get a copy, and how to delete it', async ({
    page
  }) => {
    await expect(listItems(page, "each night's backup")).toHaveText([
      /^your account and the data you sync until you delete the account/,
      /^each session until you sign out of it or delete the account; a session stops working 60 days after it was last used, and is deleted within an hour of that/,
      /^sign-in codes and one-time sign-in values for 10 minutes, deleted within an hour of that, and request counts for a day after their last request/,
      /^each sync request's result for 30 days/,
      /^each night's backup for 30 days/
    ])
    await expectNamed(page, 'Retention and deletion', [
      'delete your account in any of our apps that lets you create one',
      'on this website once it offers sign-in (if your account signs in with Apple, once the website offers Apple too)',
      'deleted within 30 days',
      'keeps working signed out'
    ])
    await expect(
      page
        .getByRole('main')
        .getByText('To get a copy of the data your account holds')
        .getByRole('link')
    ).toHaveAttribute('href', /^mailto:/)
  })

  test("names Translate's microphone, and keeps its conversations on the device", async ({
    page
  }) => {
    await expectNamed(page, 'Information in the app', [
      'Media Library photos, and Translate conversations are stored',
      'microphone only while a conversation or Listening is running',
      'recognized and translated on your device, and no audio is kept',
      'stay on your device until you delete them'
    ])
    await expectNamed(page, 'Permissions', [
      'camera access only when you choose to take a photo',
      'microphone access only when you start a Translate conversation or Listening'
    ])
  })
})
