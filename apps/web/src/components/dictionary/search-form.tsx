import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'

/** Where every dictionary search box submits, as ?q=; it redirects to the query's own page. */
export const searchAction = '/dictionary/search/'
export const searchPlaceholder = 'Search Japanese or English'

/** Submits to /dictionary/search/?q=, which redirects to the query's own page. */
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
        {/* A text input, not type="search", so browsers don't add their own clear button. */}
        <ButtonGroup className="w-full">
          <Input
            name="q"
            type="text"
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
