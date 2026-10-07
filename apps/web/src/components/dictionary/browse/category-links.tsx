import { browseCategory } from '@zenbu/dictionary-core/browse/categories'
import Link from 'next/link'
import {
  Chip,
  Chips,
  MoreLink,
  Panel,
  PanelHeading
} from '@/components/dictionary/browse/browse-ui'
import { featuredCategories } from '@/lib/dictionary/browse/copy'
import { type CategoryIndex, categoryIndexes, categoryPath } from '@/lib/dictionary/browse/paths'

const allOf: Record<CategoryIndex, string> = {
  partOfSpeech: 'All parts of speech',
  usage: 'All usage labels',
  subject: 'All subjects'
}

const groups = Object.keys(featuredCategories) as CategoryIndex[]

const featured = (index: CategoryIndex, shown: number) =>
  featuredCategories[index].slice(0, shown).flatMap(slug => browseCategory(slug) ?? [])

export function CategoryLinkLists() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {groups.map(index => (
        <Panel key={index} label={categoryIndexes[index].name} className="gap-2">
          <h3 className="mb-1 font-semibold">{categoryIndexes[index].name}</h3>
          <ul className="flex flex-col gap-2">
            {featured(index, featuredCategories[index].length).map(category => (
              <li key={category.slug}>
                <Link href={categoryPath(category.slug)} className="hover:underline">
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
          <MoreLink href={categoryIndexes[index].path}>{allOf[index]}</MoreLink>
        </Panel>
      ))}
    </div>
  )
}

const chipsShown = 6

export function CategoryChipCards() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {groups.map(index => (
        <Panel key={index} label={categoryIndexes[index].name}>
          <PanelHeading title={categoryIndexes[index].name} href={categoryIndexes[index].path} />
          <Chips label={categoryIndexes[index].name}>
            {featured(index, chipsShown).map(category => (
              <Chip key={category.slug} href={categoryPath(category.slug)}>
                {category.name}
              </Chip>
            ))}
          </Chips>
        </Panel>
      ))}
    </div>
  )
}
