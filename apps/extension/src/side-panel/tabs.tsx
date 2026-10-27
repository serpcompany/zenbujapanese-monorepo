import {
  BookMarked,
  History,
  Languages,
  type LucideIcon,
  MonitorPlay,
  ScanText
} from 'lucide-react'
import type { ComponentType } from 'react'
import { emptyTab, SignUpButton } from './empty-tab'
import { labels } from './labels'
import type { PanelTab, PanelTabProps } from './route'

export type PanelTabDefinition = {
  id: PanelTab
  label: string
  icon: LucideIcon
  Content: ComponentType<PanelTabProps>
}

export const tabs: PanelTabDefinition[] = [
  {
    id: 'video',
    label: labels.tabs.video,
    icon: MonitorPlay,
    Content: emptyTab(MonitorPlay, labels.empty.video)
  },
  {
    id: 'translate',
    label: labels.tabs.translate,
    icon: Languages,
    Content: emptyTab(Languages, labels.empty.translate)
  },
  {
    id: 'images',
    label: labels.tabs.images,
    icon: ScanText,
    Content: emptyTab(ScanText, labels.empty.images)
  },
  {
    id: 'words',
    label: labels.tabs.words,
    icon: BookMarked,
    Content: emptyTab(BookMarked, labels.empty.words, SignUpButton)
  },
  {
    id: 'recent',
    label: labels.tabs.recent,
    icon: History,
    Content: emptyTab(History, labels.empty.recent, SignUpButton)
  }
]
