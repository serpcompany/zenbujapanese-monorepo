import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { bundle, bundlePath } from '../../scripts/javascriptcore-bundle.mjs'

test("the app's bundle of the account rules is built from this source", async () => {
  expect(
    readFileSync(bundlePath, 'utf8') === (await bundle()),
    'The account rules changed since the app’s bundle was written: run pnpm bundle:javascriptcore in packages/account-rules and commit the file.'
  ).toBe(true)
})
