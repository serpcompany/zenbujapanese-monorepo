import {
  type BrowseCategory,
  browseCategories,
  type CategoryKind
} from '@zenbu/dictionary-core/browse/categories'
import type { Metadata } from 'next'
import { CategoryIndexPage } from '@/components/dictionary/browse/category-pages'
import { getCategoryCounts } from '@/lib/dictionary/browse/data'
import { type CategoryIndex, categoryIndexes } from '@/lib/dictionary/browse/paths'
import { dictionaryMetadata } from '@/lib/dictionary/metadata'

const indexes: Record<
  CategoryIndex,
  { title: string; intro: string; groups: { title: string | null; kind: CategoryKind }[] }
> = {
  partOfSpeech: {
    title: 'Japanese words by part of speech',
    intro: 'Japanese words by part of speech, as JMdict classes them, with how many each has.',
    groups: [{ title: null, kind: 'partOfSpeech' }]
  },
  usage: {
    title: 'Japanese words by usage and dialect',
    intro:
      'Japanese words by how they’re used, as JMdict labels them: register, style, and dialect.',
    groups: [
      { title: 'Usage', kind: 'usage' },
      { title: 'Dialects', kind: 'dialect' }
    ]
  },
  subject: {
    title: 'Japanese words by subject',
    intro: 'Japanese words by the field they’re used in, as JMdict labels them.',
    groups: [{ title: null, kind: 'subject' }]
  }
}

const byName = (left: BrowseCategory, right: BrowseCategory) => left.name.localeCompare(right.name)

export function categoryIndexRoute(index: CategoryIndex) {
  const { title, intro, groups } = indexes[index]
  return {
    metadata: dictionaryMetadata(categoryIndexes[index].path, title, intro) satisfies Metadata,
    async Page() {
      const counts = new Map((await getCategoryCounts()).map(({ slug, count }) => [slug, count]))
      return (
        <CategoryIndexPage
          index={index}
          intro={intro}
          groups={groups.map(group => {
            const ofKind = browseCategories.filter(category => category.kind === group.kind)
            return {
              title: group.title,
              categories: (group.kind === 'subject' ? [...ofKind].sort(byName) : ofKind).flatMap(
                category => {
                  const count = counts.get(category.slug)
                  return count ? [{ category, count }] : []
                }
              )
            }
          })}
        />
      )
    }
  }
}
