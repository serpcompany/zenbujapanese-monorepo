'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
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
import { site } from '@/lib/site'

const description =
  'Save words to lists, mark them known, and add notes and photos in the Zenbu app. Signing in on the web comes later.'

export function GetAppDialog({
  action,
  onOpenChange
}: {
  action: string | null
  onOpenChange: (open: boolean) => void
}) {
  const wide = useMediaQuery('(min-width: 768px)')
  const title = `${action ?? ''} works in the app`
  const getApp = (
    <Button nativeButton={false} render={<Link href={site.appUrl} />}>
      Get the app
    </Button>
  )
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
