'use client'

import { GetAppButton } from '@/components/site-actions'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle
} from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/use-media-query'

const description =
  'Save words to lists, mark them known, and add notes and photos in the Zenbu app. Saving lists and known words on this website comes later.'

export function GetAppDialog({
  action,
  onOpenChange
}: {
  action: string | null
  onOpenChange: (open: boolean) => void
}) {
  const wide = useMediaQuery('(min-width: 768px)')
  const title = `${action ?? ''} works in the app`
  const getApp = <GetAppButton onClick={() => onOpenChange(false)} />
  if (wide) {
    return (
      <Dialog open={action !== null} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>{getApp}</DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Drawer open={action !== null} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>{getApp}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
