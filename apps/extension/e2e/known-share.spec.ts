import {
  account,
  newEmail,
  openAccountPage,
  signInWithGoogle,
  startSignedOut
} from './account-pages.ts'
import { expect, test } from './fixtures.ts'
import { openStatus, panelBeside, watchTab } from './panel-beside.ts'
import { openAt, overlay } from './watch-page.ts'

test.use({ youTubeStandIn: true, accountService: true })

test('signed in, the share of the video’s words known shows on the player and in the Player tab, and marking a word Known raises both', async ({
  extension,
  page
}) => {
  await startSignedOut(page, extension)
  await signInWithGoogle(
    await openAccountPage(page, extension),
    account(extension),
    newEmail('share')
  )
  await openAt(page, 1)
  const pill = overlay(page).locator('[data-known-pill]')
  await expect(pill).toHaveText('You know 0%')
  const { panel, transcript } = await panelBeside(extension, await watchTab(extension))
  const share = panel.locator('[data-known-share]')
  await expect(share).toHaveText('0% 0 of 8 words known')
  await openStatus(panel, transcript)
  await panel.getByRole('menuitemradio', { name: 'Known', exact: true }).click()
  await expect(share).toHaveText('38% 3 of 8 words known')
  await expect(pill).toHaveText('You know 38%')
  await openStatus(panel, transcript)
  await panel.getByRole('menuitemradio', { name: 'Unknown', exact: true }).click()
  await expect(share).toHaveText('0% 0 of 8 words known')
  await expect(pill).toHaveText('You know 0%')
})
