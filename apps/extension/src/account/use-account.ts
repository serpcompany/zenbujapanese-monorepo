import { useEffect, useState } from 'react'
import { type Account, type AccountAnswer, askAccount, onAccountChanged } from '../shared/account'

const signedOut: Account = { signedIn: false }

export function useAccount(): Account | null {
  const [account, setAccount] = useState<Account | null>(null)
  useEffect(() => {
    let live = true
    const take = (answer: AccountAnswer) => {
      if (!live) return
      if (answer.type === 'account') setAccount(answer.account)
      else setAccount(known => known ?? signedOut)
    }
    const opened = () => void askAccount({ account: 'opened' }).then(take)
    const whenShown = () => {
      if (document.visibilityState === 'visible') opened()
    }
    opened()
    const stop = onAccountChanged(() => void askAccount({ account: 'read' }).then(take))
    window.addEventListener('focus', opened)
    document.addEventListener('visibilitychange', whenShown)
    return () => {
      live = false
      stop()
      window.removeEventListener('focus', opened)
      document.removeEventListener('visibilitychange', whenShown)
    }
  }, [])
  return account
}
