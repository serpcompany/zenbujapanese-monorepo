'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle
} from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/use-media-query'

export function Sheet({
  open,
  onOpenChange,
  title,
  header,
  wide: wideDialog = false,
  children
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  header?: ReactNode
  wide?: boolean
  children: ReactNode
}) {
  const wide = useMediaQuery('(min-width: 768px)')
  if (wide) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className={`max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] ${wideDialog ? 'sm:max-w-lg' : 'sm:max-w-md'}`}
        >
          <DialogHeader className="flex-row items-center gap-2">
            {header}
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="-mx-4 overflow-y-auto px-4">{children}</div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Done</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="flex-row items-center gap-2">
          {header}
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-4">{children}</div>
        <DrawerFooter>
          <DrawerClose render={<Button variant="outline" />}>Done</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
