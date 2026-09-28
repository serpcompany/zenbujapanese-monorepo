import { SearchIcon } from 'lucide-react'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@/components/ui/input-group'

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
      <form action="/dictionary/search/" method="get">
        <InputGroup className="h-11 bg-background shadow-xs">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            name="q"
            type="search"
            defaultValue={defaultValue}
            placeholder="Search Japanese or English"
            aria-label="Search Japanese or English"
            autoFocus={autoFocus}
            className="text-base"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton type="submit" variant="secondary">
              Search
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </search>
  )
}
