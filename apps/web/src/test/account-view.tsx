import { AccountView } from '@/components/account/account-view'
import type { AccountSettings } from '@/lib/account/settings'
import type { Locale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/dictionary'
import { render } from './account-page'
import { settings } from './signed-in-account'

export const accountText = getDictionary('en').account

export const renderAccountView = (
  shown: AccountSettings = settings(),
  locale: Locale = 'en',
  returnedFromCheckout = false
) =>
  render(
    <AccountView
      locale={locale}
      text={getDictionary(locale).account}
      settings={shown}
      returnedError={null}
      returnedFromCheckout={returnedFromCheckout}
      checkAgainAfterMs={[0, 0, 0]}
    />
  )
