'use client'

import {
  accountName,
  accountUsername,
  nameRule,
  removesTheUsername,
  usernameRule
} from '@zenbu/account-rules/profile'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AccessTokens } from '@/lib/account/access-tokens'
import type { Profile } from '@/lib/account/answers'
import type { AccountApi, ProfileChange } from '@/lib/account/client'
import { type AccountText, failureMessage, isSignedOut } from '@/lib/account/messages'
import type { Locale } from '@/lib/i18n/config'
import { fill, formatDate } from '@/lib/i18n/format'
import { FormMessage, Notice } from './form-message'

interface ProfileFormProps {
  api: AccountApi
  tokens: AccessTokens
  locale: Locale
  text: AccountText
  profile: Profile
  onChanged: (profile: Profile) => void
  onSignedOut: () => void
}

const isoDateLength = 'yyyy-mm-dd'.length

const dayMadeOf = (createdAt: string) => new Date(createdAt).toISOString().slice(0, isoDateLength)

function brokenRule({ name, username }: ProfileChange): string | null {
  if (name !== undefined && accountName(name) === null) return nameRule
  if (typeof username === 'string' && accountUsername(username) === null) return usernameRule
  return null
}

export function ProfileForm({
  api,
  tokens,
  locale,
  text,
  profile,
  onChanged,
  onSignedOut
}: ProfileFormProps) {
  const [name, setName] = useState(profile.name)
  const [username, setUsername] = useState(profile.username ?? '')
  const [shownVersion, setShownVersion] = useState(profile.version)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const words = text.profile

  if (profile.version > shownVersion) {
    setShownVersion(profile.version)
    setName(profile.name)
    setUsername(profile.username ?? '')
  }

  function showProfile(shown: Profile) {
    setName(shown.name)
    setUsername(shown.username ?? '')
    onChanged(shown)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const change: ProfileChange = { baseVersion: profile.version }
    if (name.trim() !== profile.name) change.name = name
    const wantedUsername = removesTheUsername(username) ? null : username
    if (wantedUsername !== profile.username) change.username = wantedUsername
    if (change.name === undefined && change.username === undefined) {
      return setNotice(words.nothingChanged)
    }
    const broken = brokenRule(change)
    if (broken) {
      setNotice(null)
      return setProblem(fill(text.messages.asTheServiceSays, { message: broken }))
    }
    setBusy(true)
    setProblem(null)
    setNotice(null)
    const saved = await tokens.use(token => api.changeProfile(token, change))
    setBusy(false)
    if (saved.ok) {
      showProfile(saved.value)
      return setNotice(words.saved)
    }
    if (isSignedOut(saved.failure)) return onSignedOut()
    if (saved.failure.kind === 'refused' && saved.failure.current) {
      showProfile(saved.failure.current)
    }
    setProblem(failureMessage(saved.failure, text.messages, locale))
  }

  return (
    <section aria-labelledby="profile" className="flex flex-col gap-3">
      <h2 id="profile" className="text-lg font-medium">
        {words.heading}
      </h2>
      <form className="flex flex-col gap-3" onSubmit={save}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="profile-name" className="text-sm font-medium">
            {words.name}
          </label>
          <Input
            id="profile-name"
            autoComplete="name"
            value={name}
            onChange={event => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="profile-username" className="text-sm font-medium">
            {words.username}
          </label>
          <Input
            id="profile-username"
            autoComplete="username"
            aria-describedby="profile-username-rule"
            value={username}
            onChange={event => setUsername(event.target.value)}
          />
          <p id="profile-username-rule" className="text-xs text-muted-foreground">
            {words.usernameRule}
          </p>
        </div>
        <FormMessage problem={problem} />
        <Notice>{notice}</Notice>
        <Button type="submit" className="self-start" disabled={busy}>
          {words.save}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {fill(words.memberSince, { date: formatDate(dayMadeOf(profile.createdAt), locale) })}
      </p>
    </section>
  )
}
