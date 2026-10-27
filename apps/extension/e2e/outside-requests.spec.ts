import { test } from './fixtures.ts'

test('a request to a host other than the local server fails the test', async ({ extension }) => {
  test.fail(true, 'outsideRequests fails every test that asks another host, so this one must fail')
  await extension.serviceWorker.evaluate(() =>
    fetch('https://example.com/', { mode: 'no-cors' }).catch(() => null)
  )
})
