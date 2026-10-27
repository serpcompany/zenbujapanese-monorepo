import { settingsLabels } from '../settings/labels'
import { SettingsPage } from '../settings/settings-page'
import { labels } from '../shared/labels'
import { mountPage } from './mount-page'

mountPage(`${settingsLabels.title} · ${labels.name}`, <SettingsPage />)
