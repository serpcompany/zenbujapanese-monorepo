import { describe, expect, it } from 'vitest'
import { extensionId, origin, returnedFrom, standInIdentity } from '../../test/account-stand-in'
import { authorizeWithApple, authorizeWithGoogle } from './identity'

const google = 'zenbu-extension-test.apps.googleusercontent.com'

const apple = { servicesId: 'com.zenbujapanese.website', apiOrigin: origin, extensionId }

describe('authorizeWithGoogle', () => {
  it("asks Google for an ID token carrying the service's nonce, back at the extension's own address", async () => {
    const { identity, launched } = standInIdentity(url =>
      returnedFrom(url, { id_token: 'google-id' })
    )
    const authorization = await authorizeWithGoogle(identity, google, 'nonce-1')
    expect(authorization).toEqual({
      ok: true,
      authorized: { idToken: 'google-id', code: null, name: null }
    })
    const [url] = launched
    expect(url?.origin + url?.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url?.searchParams ?? [])).toMatchObject({
      client_id: google,
      response_type: 'id_token',
      scope: 'openid email profile',
      nonce: 'nonce-1',
      redirect_uri: `https://${extensionId}.chromiumapp.org/google`,
      prompt: 'select_account'
    })
  })

  it('refuses an answer whose state is not the one it sent', async () => {
    const { identity } = standInIdentity(
      url => `${url.searchParams.get('redirect_uri')}#state=other&id_token=google-id`
    )
    await expect(authorizeWithGoogle(identity, google, 'n')).resolves.toEqual({
      ok: false,
      refusal: 'try-again'
    })
  })

  it('takes a closed window or a refusal for cancelled, and anything else for try again', async () => {
    const closed = standInIdentity(() =>
      Promise.reject(new Error('The user did not approve access.'))
    )
    const denied = standInIdentity(url => returnedFrom(url, { error: 'access_denied' }))
    const broken = standInIdentity(() =>
      Promise.reject(new Error('Authorization page could not be loaded.'))
    )
    const cancelled = { ok: false, refusal: 'cancelled' }
    await expect(authorizeWithGoogle(closed.identity, google, 'n')).resolves.toEqual(cancelled)
    await expect(authorizeWithGoogle(denied.identity, google, 'n')).resolves.toEqual(cancelled)
    await expect(authorizeWithGoogle(broken.identity, google, 'n')).resolves.toEqual({
      ok: false,
      refusal: 'try-again'
    })
  })
})

describe('authorizeWithApple', () => {
  it("asks Apple through the service's return address, with the nonce hashed and the extension named in the state", async () => {
    const user = JSON.stringify({ name: { firstName: 'Aiko', lastName: '' } })
    const { identity, launched } = standInIdentity(url =>
      returnedFrom(url, { id_token: 'apple-id', code: 'apple-code', user })
    )
    const authorization = await authorizeWithApple(identity, apple, 'nonce-1')
    expect(authorization).toEqual({
      ok: true,
      authorized: {
        idToken: 'apple-id',
        code: 'apple-code',
        name: { firstName: 'Aiko', lastName: undefined }
      }
    })
    const fields = Object.fromEntries(launched[0]?.searchParams ?? [])
    expect(fields).toMatchObject({
      client_id: 'com.zenbujapanese.website',
      redirect_uri: `${origin}/v1/auth/apple/extension`,
      response_type: 'code id_token',
      response_mode: 'form_post',
      scope: 'name email',
      nonce: '9e3f156324d42f0ea4b6f4fce81d56fbd64a2143a3fdd60a130d9c90e5b4d688'
    })
    expect(fields.state).toMatch(new RegExp(`^${extensionId}\\.[0-9a-f-]{36}$`))
  })

  it('cancels when the learner backs out of Apple, and keeps no name Apple did not send', async () => {
    const backed = standInIdentity(url => returnedFrom(url, { error: 'user_cancelled_authorize' }))
    await expect(authorizeWithApple(backed.identity, apple, 'n')).resolves.toEqual({
      ok: false,
      refusal: 'cancelled'
    })
    const later = standInIdentity(url =>
      returnedFrom(url, { id_token: 'apple-id', code: 'c', user: '{' })
    )
    await expect(authorizeWithApple(later.identity, apple, 'n')).resolves.toMatchObject({
      authorized: { name: null }
    })
  })
})
