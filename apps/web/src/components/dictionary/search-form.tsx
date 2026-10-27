import { sourceCredits } from '@zenbu/dictionary-core/sources/credits'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n/dictionary'
import { localizedPath } from '@/lib/i18n/paths'
import { RadicalInput } from './radical-input'
import { SearchSubmission } from './search-submission'
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
      <SearchSubmission action={localizedPath(searchAction, locale)}>
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
      </SearchSubmission>
    </search>
  )
}
