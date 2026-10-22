import { call } from './calls.js'
globalThis.call = call
globalThis.authFlow = (url, interactive = true) =>
  chrome.identity.launchWebAuthFlow({ url, interactive }).then(
    answer => ({ answer }),
    error => ({ error: String(error?.message ?? error) })
  )
globalThis.redirectURL = () => chrome.identity.getRedirectURL('cb')
