import { CheckIcon, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface ShowcaseArea {
  id: string
  name: string
  icon: LucideIcon
  pitch: string
  features: readonly string[]
  preview: ReactNode
}

function AreaPanel({ area }: { area: ShowcaseArea }) {
  const Icon = area.icon
  return (
    <TabsContent
      value={area.id}
      keepMounted
      className="col-start-1 row-start-1 grid overflow-hidden rounded-2xl bg-muted text-base focus-visible:ring-3 focus-visible:ring-ring/50 data-hidden:invisible data-hidden:grid! md:grid-cols-2"
    >
      <div className="flex min-w-0 flex-col gap-3.5 px-6 pt-6 pb-8 md:justify-center md:py-10 md:pr-4 md:pl-10">
        <p
          aria-hidden="true"
          className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-muted-foreground"
        >
          <Icon className="size-4" />
          {area.name}
        </p>
        <h3 className="text-xl leading-tight font-semibold tracking-tight text-balance md:text-2xl">
          {area.pitch}
        </h3>
        <ul className="flex flex-col gap-2.5 text-[0.9375rem] leading-relaxed">
          {area.features.map(feature => (
            <li key={feature} className="flex gap-2.5">
              <CheckIcon
                aria-hidden="true"
                className="mt-1 size-4 shrink-0 text-muted-foreground"
              />
              {feature}
            </li>
          ))}
        </ul>
      </div>
      <div className="order-first flex h-80 justify-center overflow-hidden px-6 pt-8 md:order-none md:h-104">
        {area.preview}
      </div>
    </TabsContent>
  )
}

export function AreaShowcase({ label, areas }: { label: string; areas: readonly ShowcaseArea[] }) {
  return (
    <Tabs defaultValue={areas[0]?.id} className="items-center gap-5">
      <div className="grid w-full">
        {areas.map(area => (
          <AreaPanel key={area.id} area={area} />
        ))}
      </div>
      <TabsList
        activateOnFocus
        aria-label={label}
        className="max-w-full justify-start overflow-x-auto overflow-y-hidden group-data-horizontal/tabs:h-10"
      >
        {areas.map(area => {
          const Icon = area.icon
          return (
            <TabsTrigger key={area.id} value={area.id} className="px-3">
              <Icon aria-hidden="true" className="hidden sm:block" />
              {area.name}
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}
