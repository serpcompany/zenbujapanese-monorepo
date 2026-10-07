'use client'

import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AccessTokens } from '@/lib/account/access-tokens'
import type { Profile } from '@/lib/account/answers'
import type { AccountApi, ProfileChange } from '@/lib/account/client'
import { failureMessage, isSignedOut } from '@/lib/account/messages'
import { FormMessage, Notice } from './form-message'

interface ProfileFormProps {
  api: AccountApi
  tokens: AccessTokens
  profile: Profile
  onChanged: (profile: Profile) => void
  onSignedOut: () => void
}

const memberSince = (createdAt: string) =>
  new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(createdAt))

export function ProfileForm({ api, tokens, profile, onChanged, onSignedOut }: ProfileFormProps) {
  const [name, setName] = useState(profile.name)
  const [username, setUsername] = useState(profile.username ?? '')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function showProfile(shown: Profile) {
    setName(shown.name)
    setUsername(shown.username ?? '')
    onChanged(shown)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const change: ProfileChange = { baseVersion: profile.version }
    if (name.trim() !== profile.name) change.name = name
    const wantedUsername = username.trim() === '' ? null : username
    if (wantedUsername !== profile.username) change.username = wantedUsername
    if (change.name === undefined && change.username === undefined) {
      return setNotice('Nothing has changed.')
    }
    setBusy(true)
    setProblem(null)
    setNotice(null)
    const saved = await tokens.use(token => api.changeProfile(token, change))
    setBusy(false)
    if (saved.ok) {
      showProfile(saved.value)
      return setNotice('Saved.')
    }
    if (isSignedOut(saved.failure)) return onSignedOut()
    if (saved.failure.kind === 'refused' && saved.failure.current) {
      showProfile(saved.failure.current)
    }
    setProblem(failureMessage(saved.failure))
  }

  return (
    <section aria-labelledby="profile" className="flex flex-col gap-3">
      <h2 id="profile" className="text-lg font-medium">
        Profile
      </h2>
      <form className="flex flex-col gap-3" onSubmit={save}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="profile-name" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="profile-name"
            autoComplete="name"
            maxLength={100}
            value={name}
            onChange={event => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="profile-username" className="text-sm font-medium">
            Username
          </label>
          <Input
            id="profile-username"
            autoComplete="username"
            maxLength={30}
            aria-describedby="profile-username-rule"
            value={username}
            onChange={event => setUsername(event.target.value)}
          />
          <p id="profile-username-rule" className="text-xs text-muted-foreground">
            3 to 30 letters, digits, or underscores. Leave it empty for none.
          </p>
        </div>
        <FormMessage problem={problem} />
        <Notice>{notice}</Notice>
        <Button type="submit" className="self-start" disabled={busy}>
          Save
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Member since {memberSince(profile.createdAt)}.
      </p>
    </section>
  )
}
