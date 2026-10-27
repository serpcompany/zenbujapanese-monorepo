import { expect, test } from './fixtures.ts'

test('the guard catches a request to a host other than the local server', async ({
  extension,
  outsideRequests
}) => {
  await extension.serviceWorker.evaluate(() =>
    fetch('https://example.com/', { mode: 'no-cors' }).catch(() => null)
  )
  await expect.poll(() => outsideRequests).toContain('https://example.com/')
  outsideRequests.length = 0
})
