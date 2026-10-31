import { useEffect, useState } from 'react'
import { readSettings, type Settings, watchSettings } from './settings'

export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null)
  useEffect(() => {
    let listening = true
    const stopWatching = watchSettings(next => {
      if (listening) setSettings(next)
    })
    readSettings().then(
      read => {
        if (listening) setSettings(current => current ?? read)
      },
      () => undefined
    )
    return () => {
      listening = false
      stopWatching()
    }
  }, [])
  return settings
}
