import { buttonVariants } from '@zenbu/ui/components/button'
import {
  ChartColumnIcon,
  DatabaseIcon,
  GlobeIcon,
  type LucideIcon,
  ScrollTextIcon,
  TypeIcon
} from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import type { Settings } from '../shared/settings'
import { useSettings } from '../shared/use-settings'
import { CreditsPage } from './credits-page'
import { DictionaryDataPage } from './dictionary-data-page'
import { FrequencyPage } from './frequency-page'
import { settingsLabels } from './labels'
import { ReadingAidsPage } from './reading-aids-page'
import { SitesPage } from './sites-page'

type SettingsSection = {
  id: string
  title: string
  icon: LucideIcon
  render(settings: Settings): ReactNode
}

const sections: SettingsSection[] = [
  {
    id: 'reading-aids',
    title: settingsLabels.pages.readingAids,
    icon: TypeIcon,
    render: settings => <ReadingAidsPage settings={settings} />
  },
  {
    id: 'frequency-dictionaries',
    title: settingsLabels.pages.frequencyDictionaries,
    icon: ChartColumnIcon,
    render: settings => <FrequencyPage settings={settings} />
  },
  {
    id: 'dictionary-data',
    title: settingsLabels.pages.dictionaryData,
    icon: DatabaseIcon,
    render: () => <DictionaryDataPage />
  },
  {
    id: 'sites',
    title: settingsLabels.pages.sites,
    icon: GlobeIcon,
    render: settings => <SitesPage settings={settings} />
  },
  {
    id: 'credits',
    title: settingsLabels.pages.credits,
    icon: ScrollTextIcon,
    render: () => <CreditsPage />
  }
]

const sectionAt = (hash: string): SettingsSection =>
  sections.find(section => `#${section.id}` === hash) ?? sections[0]

function useSection(): SettingsSection {
  const [section, setSection] = useState(() => sectionAt(location.hash))
  useEffect(() => {
    const follow = () => setSection(sectionAt(location.hash))
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [])
  return section
}

export function SettingsPage() {
  const settings = useSettings()
  const current = useSection()
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:flex-row sm:gap-8 sm:p-6">
      <aside className="flex flex-col gap-2 sm:sticky sm:top-6 sm:w-56 sm:shrink-0 sm:self-start">
        <h1 className="font-heading text-lg font-semibold">{settingsLabels.title}</h1>
        <nav aria-label={settingsLabels.title} className="flex flex-wrap gap-1 sm:flex-col">
          {sections.map(({ id, title, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={id === current.id ? 'page' : undefined}
              className={buttonVariants({
                variant: 'ghost',
                className: 'justify-start aria-[current=page]:bg-muted'
              })}
            >
              <Icon data-icon="inline-start" />
              {title}
            </a>
          ))}
        </nav>
      </aside>
      <main data-settings-page={current.id} className="flex min-w-0 flex-1 flex-col gap-4">
        <h2 className="font-heading text-lg font-semibold">{current.title}</h2>
        {settings ? current.render(settings) : null}
      </main>
    </div>
  )
}
