import { sourceCredits } from '@zenbu/dictionary-core/sources/credits'
import { Button } from '@zenbu/ui/components/button'
import { ButtonGroup } from '@zenbu/ui/components/button-group'
import { Input } from '@zenbu/ui/components/input'
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'
import { RadicalInput } from './radical-input'
import { SourceCreditLine } from './source-credits'

const searchAction = '/dictionary/search/'
const typeWithoutBrowserClearButton = 'text'

export function SearchForm({
  locale,
  text,
  defaultValue,
  autoFocus
}: {
  locale: Locale
  text: Dictionary['searchForm']
  defaultValue?: string
  autoFocus?: boolean
}) {
  return (
    <search>
      <form action={localizedPath(searchAction, locale)} method="get">
        <ButtonGroup className="w-full">
          <Input
            name="q"
            type={typeWithoutBrowserClearButton}
            enterKeyHint="search"
            defaultValue={defaultValue}
            placeholder={text.placeholder}
            aria-label={text.placeholder}
            autoFocus={autoFocus}
            className="h-11 bg-background text-base"
          />
          <RadicalInput
            locale={locale}
            text={text.radicals}
            credit={<SourceCreditLine source={sourceCredits.radkfile} locale={locale} />}
          />
          <Button type="submit" variant="outline" className="h-11">
            {text.submit}
          </Button>
        </ButtonGroup>
      </form>
    </search>
  )
}
