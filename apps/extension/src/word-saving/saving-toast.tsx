import { fill } from '@zenbu/dictionary-core/detail/template'
import { Button } from '@zenbu/ui/components/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle
} from '@zenbu/ui/components/item'
import { accountPage } from '../shared/account'
import { wordDetailLabels } from '../word-detail/labels'
import { type SavingToast, useSaving } from './saving'

const labels = wordDetailLabels.saving

function toastText(toast: SavingToast) {
  if (toast.kind === 'known') {
    return { ...labels.known, title: fill(labels.known.title, { name: toast.headword }) }
  }
  return toast.kind === 'signed-out' ? labels.signedOut : labels.subscription
}

function ToastAction({ toast }: { toast: SavingToast }) {
  const { port, dismiss } = useSaving()
  const { action } = toastText(toast)
  if (toast.kind === 'subscription-required') {
    return (
      <Button
        size="sm"
        nativeButton={false}
        render={
          <a href={accountPage} target="_blank" rel="noreferrer" onClick={dismiss}>
            {action}
          </a>
        }
      />
    )
  }
  const act = toast.kind === 'known' ? toast.undo : port.signIn
  return (
    <Button
      size="sm"
      variant={toast.kind === 'known' ? 'outline' : 'default'}
      onClick={() => {
        act()
        dismiss()
      }}
    >
      {action}
    </Button>
  )
}

export function SavingToastView({ className }: { className?: string }) {
  const { toast } = useSaving()
  if (!toast) return null
  const { title, text } = toastText(toast)
  return (
    <Item variant="outline" role="status" data-saving-toast={toast.kind} className={className}>
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription>{text}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <ToastAction toast={toast} />
      </ItemActions>
    </Item>
  )
}
