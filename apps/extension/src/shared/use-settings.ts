import { type Settings, settingDefaults } from './settings'

export function useSettings(): Settings | null {
  return settingDefaults
}
