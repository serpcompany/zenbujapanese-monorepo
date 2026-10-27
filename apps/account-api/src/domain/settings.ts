import { isSetting, settingValue, valueText } from '@zenbu/account-rules/settings'
import {
  applied,
  type Change,
  conflict,
  type Entity,
  gone,
  journaled,
  needsBaseVersion,
  rejected
} from './entities'
import type { Setting } from './kept-store'
import { rejection } from './profile'

const unknownSetting = rejection(
  'unknown_setting',
  'This service syncs no setting of that name. Keep it on the device, and send it again once the service knows it.'
)
const badValue = (name: string) =>
  rejection('invalid_fields', `A setting's \`set\` has value, and only value: ${valueText(name)}.`)

const asChange = (setting: Setting): Change => ({
  entity: 'setting',
  entityId: setting.name,
  operation: 'put',
  version: setting.version,
  data: { name: setting.name, value: setting.value }
})

export const settings: Entity = {
  reads: 'settings:read',
  operations: {
    set: {
      needs: ['settings:write'],
      async apply(account, mutation) {
        const name = mutation.entityId
        if (!name || !isSetting(name)) return rejected(unknownSetting)
        if (mutation.baseVersion === undefined) return rejected(needsBaseVersion)
        const fields = mutation.fields ?? {}
        const value = settingValue(name, fields.value)
        if (value === null || Object.keys(fields).length !== 1) return rejected(badValue(name))
        const current = await account.setting(name)
        const version = current?.version ?? 0
        if (current?.value === value) return applied(version)
        if (mutation.baseVersion !== version) {
          return conflict(current ? asChange(current) : gone('setting', name, 0))
        }
        await account.saveSetting({ name, value, version: version + 1 })
        return journaled(account, 'setting', name, version + 1, 'set')
      }
    }
  },
  async current(reader, entityId) {
    const setting = await reader.setting(entityId)
    return setting ? asChange(setting) : gone('setting', entityId, 0)
  }
}
