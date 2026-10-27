import { Button } from '@zenbu/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@zenbu/ui/components/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@zenbu/ui/components/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@zenbu/ui/components/dropdown-menu'
import { useState } from 'react'
import type { ReadData } from '../src/shared/dictionary-progress'
import { DictionaryStatus } from '../src/shared/dictionary-status'

export function TestSurface({ read }: { read?: ReadData }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  return (
    <Card data-test="card" className="m-4 w-96">
      <CardHeader>
        <CardTitle>食べる</CardTitle>
        <CardDescription>to eat</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <DictionaryStatus read={read} />
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button data-test="menu-trigger" variant="outline" />}>
              Menu
            </DropdownMenuTrigger>
            <DropdownMenuContent data-test="menu">
              <DropdownMenuItem>Save</DropdownMenuItem>
              <DropdownMenuItem>Copy</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button data-test="dialog-trigger" onClick={() => setDialogOpen(true)}>
            Dialog
          </Button>
        </div>
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        Mounted by the test content script
      </CardFooter>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-test="dialog">
          <DialogHeader>
            <DialogTitle>A dialog in a shadow root</DialogTitle>
            <DialogDescription>Esc or a click outside closes it.</DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </Card>
  )
}
