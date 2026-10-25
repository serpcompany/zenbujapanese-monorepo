import { type Case, cases, type Text, textOf } from '@zenbu/account-rules/test/cases'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { AccessTokens } from '@/lib/account/access-tokens'
import type { AccountApi, ProfileChange } from '@/lib/account/client'
import { click, fill, render, settle, submit, unmount } from '@/test/account-page'
import { accountText as text } from '@/test/account-view'
import { profile } from '@/test/signed-in-account'
import { EmailCodeForm } from './email-code-form'
import { ProfileForm } from './profile-form'

afterEach(unmount)

const names = cases<{ rule: string; accepted: (Case & { name: Text })[]; refused: Case[] }>('name')
const usernames = cases<{
  rule: string
  accepted: (Case & { username: Text })[]
  refused: Case[]
  removes: Case[]
}>('username')
const codes = cases<{ accepted: (Case & { code: string })[]; refused: Case[] }>('sign-in-code')

const tokens = { use: call => call('access') } as AccessTokens

async function saved(label: string, typed: Text) {
  const changeProfile = vi.fn(async (_: string, change: ProfileChange) => ({
    ok: true as const,
    value: { ...profile, ...change }
  }))
  const page = render(
    <ProfileForm
      api={{ changeProfile } as unknown as AccountApi}
      tokens={tokens}
      locale="en"
      text={text}
      profile={{ ...profile, name: 'Someone', username: 'someone' }}
      onChanged={() => undefined}
      onSignedOut={() => undefined}
    />
  )
  await fill(page, label, textOf(typed))
  await submit(page, 'Save')
  const sent = changeProfile.mock.calls[0]?.[1]
  const shown = page.textContent ?? ''
  unmount()
  return { sent, shown }
}

describe("the website's profile form", () => {
  test('sends a name the shared rule keeps, whole, however many UTF-16 units it takes', async () => {
    for (const { covers, typed } of names.accepted) {
      expect((await saved('Name', typed)).sent, covers).toEqual({
        baseVersion: profile.version,
        name: textOf(typed)
      })
    }
  })

  test('sends no name the shared rule refuses, and shows its sentence', async () => {
    for (const { covers, typed } of names.refused) {
      const { sent, shown } = await saved('Name', typed)
      expect(sent, covers).toBeUndefined()
      expect(shown, covers).toContain(names.rule)
    }
  })

  test('sends a username the shared rule keeps, and removes one left blank', async () => {
    for (const { covers, typed } of usernames.accepted) {
      expect((await saved('Username', typed)).sent?.username, covers).toBe(textOf(typed))
    }
    for (const { covers, typed } of usernames.removes) {
      expect((await saved('Username', typed)).sent?.username, covers).toBeNull()
    }
  })

  test('sends no username the shared rule refuses, and shows its sentence', async () => {
    const blank = new Set(usernames.removes.map(({ typed }) => textOf(typed)))
    for (const { covers, typed } of usernames.refused.filter(
      ({ typed }) => !blank.has(textOf(typed))
    )) {
      const { sent, shown } = await saved('Username', typed)
      expect(sent, covers).toBeUndefined()
      expect(shown, covers).toContain(usernames.rule)
    }
  })
})

async function codeSent(typed: Text) {
  const signInWithCode = vi.fn(async () => ({ ok: true as const, value: undefined }))
  const api = { sendCode: async () => ({ ok: true as const, value: undefined }), signInWithCode }
  const page = render(
    <EmailCodeForm
      api={api as unknown as AccountApi}
      locale="en"
      text={text}
      email="kana@example.com"
      signInLabel="Sign in"
      onSignedIn={() => undefined}
    />
  )
  await click(page, text.emailCode.send)
  const field = page.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]')
  await fill(page, text.emailCode.code, textOf(typed))
  await submit(page, 'Sign in')
  await settle()
  const sent = (signInWithCode.mock.calls[0] as unknown[] | undefined)?.[1]
  const valid = field?.checkValidity()
  unmount()
  return { sent, valid }
}

describe("the website's sign-in code field", () => {
  test('takes six digits once trimmed, as the shared rule says, a space before them too', async () => {
    for (const { covers, typed, code } of codes.accepted) {
      expect(await codeSent(typed), covers).toEqual({ sent: code, valid: true })
    }
  })

  test('sends nothing the shared rule refuses', async () => {
    for (const { covers, typed } of codes.refused) {
      expect((await codeSent(typed)).sent, covers).toBeUndefined()
    }
  })
})
