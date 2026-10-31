import { type Settings, settingDefaults } from '../shared/settings'
import type { PlayerCaptions } from '../video/video-page'

export function pageSettings(initial: Partial<Settings>) {
  let current: Settings = { ...settingDefaults, ...initial }
  const listeners = new Set<(settings: Settings) => void>()
  const settings: PlayerCaptions['settings'] = {
    ask: async () => current,
    onChanged(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }
  }
  return {
    settings,
    listening: () => listeners.size,
    change(next: Partial<Settings>) {
      current = { ...current, ...next }
      for (const listener of [...listeners]) listener(current)
    }
  }
}
