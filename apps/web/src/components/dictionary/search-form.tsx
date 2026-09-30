import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'

export const searchAction = '/dictionary/search/'
export const searchPlaceholder = 'Search Japanese or English'
export const typeWithoutBrowserClearButton = 'text'

export function SearchForm({
  defaultValue,
  autoFocus
}: {
  defaultValue?: string
  autoFocus?: boolean
}) {
  return (
    <search>
      <form action={searchAction} method="get">
        <ButtonGroup className="w-full">
          <Input
            name="q"
            type={typeWithoutBrowserClearButton}
            enterKeyHint="search"
            defaultValue={defaultValue}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            autoFocus={autoFocus}
            className="h-11 bg-background text-base"
          />
          <Button type="submit" variant="outline" className="h-11">
            Search
          </Button>
        </ButtonGroup>
      </form>
    </search>
  )
}
