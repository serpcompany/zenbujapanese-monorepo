import { ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import { Item, ItemActions, ItemContent, ItemMedia } from '@/components/ui/item'
import type { KanjiElement } from '@/lib/dictionary/detail/kanji'
import { kanjiElementPath } from '@/lib/dictionary/urls'
import { Section } from './section'

/**
 * The kanji page's Elements, as KanjiDetailView.swift's KanjiElementsSection: each element with
 * its role and up to three meanings, or its linked on-readings, opening the element's page as the
 * app's row opens its element screen.
 */
export function KanjiElementsSection({ elements }: { elements: KanjiElement[] }) {
  return (
    <Section title="Elements">
      <div className="-mx-3 flex flex-col">
        {elements.map(element => (
          <Item
            key={element.character}
            data-kanji-element={element.character}
            aria-label={`Element ${element.character}, ${element.roleLabel.toLowerCase()}, ${element.description}`}
            render={<Link href={kanjiElementPath(element.character)} />}
          >
            <ItemMedia className="size-14 rounded-lg bg-muted text-3xl">
              <span lang="ja">{element.character}</span>
            </ItemMedia>
            <ItemContent>
              <p className="text-xs font-medium text-muted-foreground" data-kanji-element-role>
                {element.roleLabel}
              </p>
              <p data-kanji-element-description>{element.description}</p>
            </ItemContent>
            <ItemActions>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </ItemActions>
          </Item>
        ))}
      </div>
    </Section>
  )
}
