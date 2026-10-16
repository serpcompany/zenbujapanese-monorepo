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
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { DialogCloseButton } from './dialog-close-button'

export type AppAction = keyof Dictionary['learner']['inApp']

export function GetAppDialog({
  action,
  locale,
  text,
  onOpenChange
}: {
  action: AppAction | null
  locale: Locale
  text: Dictionary['learner']
  onOpenChange: (open: boolean) => void
}) {
  const wide = useMediaQuery('(min-width: 768px)')
  const title = action ? text.inApp[action] : ''
  const getApp = (
    <GetAppButton locale={locale} label={text.getTheApp} onClick={() => onOpenChange(false)} />
  )
  if (wide) {
    return (
      <Dialog open={action !== null} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{text.appDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>{getApp}</DialogFooter>
          <DialogCloseButton label={text.close} />
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Drawer open={action !== null} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{text.appDescription}</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>{getApp}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
