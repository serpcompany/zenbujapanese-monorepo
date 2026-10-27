import { XIcon } from 'lucide-react'
import { Button } from '../components/button'
import { DialogClose } from '../components/dialog'

export function DialogCloseButton({ label }: { label: string }) {
  return (
    <DialogClose
      render={
        <Button
          variant="ghost"
          className="absolute top-2 right-2"
          size="icon-sm"
          aria-label={label}
        />
      }
    >
      <XIcon />
    </DialogClose>
  )
}
