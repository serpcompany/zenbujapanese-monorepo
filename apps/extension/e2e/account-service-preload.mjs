const keys = JSON.parse(process.env.ZENBU_TEST_PROVIDER_KEYS ?? '{}')

const served = [
  ['https://www.googleapis.com/oauth2/v3/certs', keys.google],
  ['https://appleid.apple.com/auth/keys', keys.apple]
]

const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])

const realFetch = globalThis.fetch

globalThis.fetch = (input, init) => {
  const url = input instanceof Request ? input.url : String(input)
  const keysFor = served.find(([address]) => url.startsWith(address))?.[1]
  if (keysFor) return Promise.resolve(Response.json(keysFor))
  if (localHosts.has(new URL(url).hostname)) return realFetch(input, init)
  return Promise.reject(new TypeError(`The browser tests' account service asks no one outside.`))
}
