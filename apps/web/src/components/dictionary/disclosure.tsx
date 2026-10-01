'use client'

import { ChevronDownIcon } from 'lucide-react'
import { type ReactNode, useEffect, useId, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const buttonClass =
  'flex w-full cursor-pointer items-center gap-3 rounded-md text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none'

type Content = ReactNode | ((opened: boolean) => ReactNode)

function useDisclosure(id: string | undefined) {
  const [open, setOpen] = useState(false)
  const [opened, setOpened] = useState(false)
  useEffect(() => {
    if (!id) return
    const openWhenNamed = () => {
      if (window.location.hash === `#${id}`) {
        setOpen(true)
        setOpened(true)
      }
    }
    openWhenNamed()
    window.addEventListener('hashchange', openWhenNamed)
    return () => window.removeEventListener('hashchange', openWhenNamed)
  }, [id])
  const toggle = () => {
    setOpen(!open)
    setOpened(true)
  }
  return { open, opened, toggle }
}

function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronDownIcon
      aria-hidden
      className={cn(
        'ml-auto size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
        open && 'rotate-180'
      )}
    />
  )
}

export function Disclosure({
  summary,
  children,
  id,
  label,
  className,
  buttonClassName,
  ...data
}: {
  summary: ReactNode
  children: Content
  id?: string
  label?: string
  className?: string
  buttonClassName?: string
} & Record<`data-${string}`, string | undefined>) {
  const { open, opened, toggle } = useDisclosure(id)
  const panel = useId()
  return (
    <div id={id} className={cn('scroll-mt-4', className)} {...data}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        aria-label={label}
        className={cn(buttonClass, buttonClassName)}
        onClick={toggle}
      >
        {summary}
        <Chevron open={open} />
      </button>
      <div id={panel} hidden={!open}>
        {typeof children === 'function' ? children(opened) : children}
      </div>
    </div>
  )
}

export function DisclosureSection({
  id,
  title,
  children
}: {
  id: string
  title: string
  children: ReactNode
}) {
  const { open, toggle } = useDisclosure(id)
  const panel = useId()
  return (
    <Card id={id} className="scroll-mt-4">
      <CardContent>
        <h2 className="font-heading text-base leading-snug font-medium">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panel}
            className={cn(buttonClass, '-mx-2 w-[calc(100%+1rem)] px-2 py-1')}
            onClick={toggle}
          >
            {title}
            <Chevron open={open} />
          </button>
        </h2>
        <div id={panel} hidden={!open} className="pt-4">
          {children}
        </div>
      </CardContent>
    </Card>
  )
}
