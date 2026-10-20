import { Environment } from '@apple/app-store-server-library'
import { expect, test } from 'vitest'
import { standInAppStore } from '../test/app-store'
import { logged } from '../test/logged'
import { appStoreApi } from './app-store-api'

test('gives up on an App Store Server API call that takes too long, and says so', async () => {
  const lines = logged()
  const appStore = standInAppStore()
  appStore.api.state.stalls = true
  const api = appStoreApi(appStore.api.clients, 5)
  expect(await api.latest(Environment.PRODUCTION, '2000000000000001')).toBeNull()
  expect(await api.recent(Environment.PRODUCTION, new Date())).toEqual([])
  expect(lines()).toContain("didn't give a subscription's status")
  expect(lines()).toContain("didn't give the notification history")
})
