'use client'

import { SearchIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  searchAction,
  searchPlaceholder,
  typeWithoutBrowserClearButton
} from '@/components/dictionary/search-form'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'

function useHasOwnSearch() {
  const path = usePathname().replace(/\/$/, '')
  return (
    path === '/dictionary' ||
    path === '/dictionary/search' ||
    path.startsWith('/dictionary/search/')
  )
}

export function HeaderSearchField() {
  if (useHasOwnSearch()) return null
  return (
    <search className="hidden w-full max-w-md md:block">
      <form action={searchAction} method="get">
        <InputGroup className="h-9 bg-background shadow-xs">
          <InputGroupInput
            name="q"
            type={typeWithoutBrowserClearButton}
            enterKeyHint="search"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>
      </form>
    </search>
  )
}

export function HeaderSearchLink() {
  if (useHasOwnSearch()) return null
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      className="md:hidden"
      nativeButton={false}
      render={<Link href={searchAction} aria-label="Search the dictionary" />}
    >
      <SearchIcon />
    </Button>
  )
}
