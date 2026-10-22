export const api = 'http://localhost:8790'
export async function call(path, { method = 'GET', body, headers = {} } = {}) {
  try {
    const response = await fetch(api + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-zenbu-client': 'zenbu-extension', 'cf-connecting-ip': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.1`, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const text = await response.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return { status: response.status, json, sessionToken: response.headers.get('set-auth-token'), setCookieVisible: response.headers.has('set-cookie') }
  } catch (error) {
    return { failed: String(error) }
  }
}
