'use client'

import { CheckIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { type ShowcaseMedia, ShowcaseStage } from '@/components/showcase-stage'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export interface ShowcaseArea {
  id: string
  name: string
  icon: ReactNode
  pitch: string
  features: readonly string[]
  media: readonly ShowcaseMedia[]
}

function AreaCaption({ area }: { area: ShowcaseArea }) {
  return (
    <TabsContent
      value={area.id}
      keepMounted
      hidden={false}
      className="col-start-1 row-start-1 flex flex-col items-center gap-4.5 rounded-lg text-center text-base focus-visible:ring-3 focus-visible:ring-ring/50 data-hidden:invisible"
    >
      <h3 className="text-xl leading-tight font-semibold tracking-tight text-balance md:text-[1.375rem]">
        {area.pitch}
      </h3>
      <ul className="grid w-full max-w-3xl gap-2 text-left text-[0.9375rem] leading-relaxed md:grid-cols-2 md:gap-x-8">
        {area.features.map(feature => (
          <li key={feature} className="flex gap-2">
            <CheckIcon aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
            {feature}
          </li>
        ))}
      </ul>
    </TabsContent>
  )
}

export function AreaShowcase({ label, areas }: { label: string; areas: readonly ShowcaseArea[] }) {
  const [selected, setSelected] = useState(areas[0]?.id)
  return (
    <Tabs value={selected} onValueChange={setSelected} className="gap-5">
      <div className="grid h-96 overflow-hidden rounded-2xl bg-muted md:h-112 lg:h-128">
        {areas.map(area => (
          <ShowcaseStage
            key={area.id}
            name={area.name}
            media={area.media}
            shown={area.id === selected}
          />
        ))}
      </div>
      <TabsList
        activateOnFocus
        aria-label={label}
        className="grid w-full grid-cols-5 gap-0.5 rounded-xl p-1 group-data-horizontal/tabs:h-auto sm:inline-flex sm:w-fit sm:self-center sm:rounded-full"
      >
        {areas.map(area => (
          <TabsTrigger
            key={area.id}
            value={area.id}
            className={cn(
              'h-auto min-w-0 flex-col gap-1 rounded-lg px-1 py-2 text-xs leading-tight whitespace-normal',
              'sm:h-10 sm:flex-none sm:flex-row sm:gap-2 sm:rounded-full sm:px-3 sm:py-0 md:px-4 sm:text-[0.9375rem] sm:whitespace-nowrap'
            )}
          >
            {area.icon}
            {area.name}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="mt-2 grid">
        {areas.map(area => (
          <AreaCaption key={area.id} area={area} />
        ))}
      </div>
    </Tabs>
  )
}
