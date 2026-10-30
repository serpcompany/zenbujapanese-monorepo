import { CircleUserRound, Languages, type LucideIcon, SquarePlay } from 'lucide-react'
import type { ComponentType } from 'react'
import { TranslateTab } from '../translate/translate-tab'
import { VideoTab } from '../video-tab/video-tab'
import { AccountTab } from './account-tab'
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
    id: 'player',
    label: labels.tabs.player,
    icon: SquarePlay,
    Content: VideoTab
  },
  {
    id: 'translate',
    label: labels.tabs.translate,
    icon: Languages,
    Content: TranslateTab
  },
  {
    id: 'account',
    label: labels.tabs.account,
    icon: CircleUserRound,
    Content: AccountTab
  }
]
